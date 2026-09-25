export const DEFAULT_FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

export function createOcclusionFragment(maxBlockers: number): string {
  return `
    precision mediump float;

    uniform vec2 uImageSize;
    uniform float uCellSizePx;
    uniform float uBlockerCount;
    uniform vec2 uBlockerPosPx[${maxBlockers}];
    uniform float uBlockerHalfSizeXCells[${maxBlockers}];
    uniform float uBlockerHalfSizeYCells[${maxBlockers}];
    uniform float uBlockerCornerStyle[${maxBlockers}];
    uniform float uBlockerElevationCells[${maxBlockers}];
    uniform float uBlockerStrength[${maxBlockers}];
    uniform float uHeightEncodeScale;

    out vec4 finalColor;

    void main(void) {
      vec2 pixel = gl_FragCoord.xy;
      float maxHeightCells = 0.0;
      float maxStrength = 0.0;
      float occupied = 0.0;

      for (int i = 0; i < ${maxBlockers}; i++) {
        if (float(i) < uBlockerCount) {
          vec2 deltaCells = abs((pixel - uBlockerPosPx[i]) / max(uCellSizePx, 0.0001));
          float halfSizeX = uBlockerHalfSizeXCells[i];
          float halfSizeY = uBlockerHalfSizeYCells[i];
          float cornerRadius = min(0.5 * uBlockerCornerStyle[i], min(halfSizeX, halfSizeY));
          vec2 roundedBoxOffset = deltaCells - vec2(halfSizeX - cornerRadius, halfSizeY - cornerRadius);
          float roundedBoxDistance = length(max(roundedBoxOffset, vec2(0.0)))
            + min(max(roundedBoxOffset.x, roundedBoxOffset.y), 0.0)
            - cornerRadius;
          bool inside = roundedBoxDistance <= 0.0;

          if (inside) {
            occupied = 1.0;
            float heightCells = uBlockerElevationCells[i];
            if (heightCells >= maxHeightCells) {
              maxHeightCells = heightCells;
              maxStrength = uBlockerStrength[i];
            }
          }
        }
      }

      float encodedHeight = clamp(maxHeightCells / max(uHeightEncodeScale, 0.0001), 0.0, 1.0);
      finalColor = vec4(encodedHeight, clamp(maxStrength, 0.0, 1.0), occupied, 1.0);
    }
  `;
}

export function createLightFragment(maxLights: number): string {
  return `
    precision mediump float;

    uniform vec2 uImageSize;
    uniform float uAmbient;
    uniform float uIntensity;
    uniform float uLightCount;
    uniform vec2 uLightPosPx[${maxLights}];
    uniform float uLightIntensity[${maxLights}];
    uniform vec4 uLightInnerColor[${maxLights}];
    uniform vec3 uLightOuterColor[${maxLights}];
    uniform float uLightGradientExp[${maxLights}];
    uniform vec2 uLightDir[${maxLights}];
    uniform float uLightConeDeg[${maxLights}];
    uniform float uLightHeightCells[${maxLights}];
    uniform sampler2D uOcclusionMap;
    uniform sampler2D uOcclusionOccupancyMap;
    uniform float uHeightEncodeScale;

    out vec4 finalColor;

    float rayShadowAmountByMap(vec2 lightPos, vec2 pixelPos, float lightHeightCells) {
      vec2 ray = pixelPos - lightPos;
      float rayLen = length(ray);
      if (rayLen <= 0.0001) return 0.0;

      vec2 direction = ray / rayLen;
      const int STEPS = 32;
      float strongestShadow = 0.0;
      for (int s = 1; s < STEPS; s++) {
        float rayFraction = float(s) / float(STEPS);
        vec2 samplePos = lightPos + direction * (rayLen * rayFraction);
        vec2 uv = clamp(samplePos / uImageSize, 0.0, 1.0);
        vec4 occlusion = texture(uOcclusionMap, uv);
        float blockerHeightCells = occlusion.r * uHeightEncodeScale;
        float blockerStrength = occlusion.g;
        float rayHeightAtSample = lightHeightCells * (1.0 - rayFraction);

        if (blockerHeightCells >= rayHeightAtSample && blockerHeightCells > 0.0) {
          strongestShadow = max(strongestShadow, blockerStrength);
        }
      }
      return strongestShadow;
    }

    float profile(float distanceRatio) {
      if (distanceRatio >= 1.0) return 0.0;
      if (distanceRatio < 0.30) return mix(1.0, 0.65, distanceRatio / 0.30);
      if (distanceRatio < 0.65) return mix(0.65, 0.25, (distanceRatio - 0.30) / 0.35);
      return mix(0.25, 0.0, (distanceRatio - 0.65) / 0.35);
    }

    float coneFactor(vec2 lightForward, float coneAngleDeg, vec2 toPixelDir) {
      if (coneAngleDeg >= 359.5) return 1.0;
      float cosTheta = dot(normalize(lightForward), normalize(toPixelDir));
      float coneThreshold = cos(radians(coneAngleDeg * 0.5));
      return cosTheta >= coneThreshold ? 1.0 : 0.0;
    }

    void main(void) {
      vec2 pixel = gl_FragCoord.xy;
      vec3 illumination = vec3(uAmbient);

      for (int i = 0; i < ${maxLights}; i++) {
        if (float(i) < uLightCount) {
          vec2 lightPos = uLightPosPx[i];
          vec2 delta = pixel - lightPos;
          float distancePx = length(delta);
          float lightRadiusPx = max(uLightInnerColor[i].a * 600.0, 0.0001);
          float distanceRatio = distancePx / lightRadiusPx;
          vec2 toPixelDir = distancePx > 0.0001 ? delta / distancePx : vec2(1.0, 0.0);
          float directionalMask = coneFactor(uLightDir[i], uLightConeDeg[i], toPixelDir);

          vec2 targetUv = clamp(pixel / uImageSize, 0.0, 1.0);
          float targetIsBlocker = texture(uOcclusionOccupancyMap, targetUv).b;
          float shadowAmount = targetIsBlocker > 0.5
            ? 0.0
            : rayShadowAmountByMap(lightPos, pixel, uLightHeightCells[i]);
          float visibility = 1.0 - clamp(shadowAmount, 0.0, 1.0);

          float gradientT = pow(clamp(distanceRatio, 0.0, 1.0), max(uLightGradientExp[i], 0.0001));
          vec3 gradientColor = mix(uLightInnerColor[i].rgb, uLightOuterColor[i], gradientT);
          float animatedIntensity = uIntensity * uLightIntensity[i];
          illumination += gradientColor * (animatedIntensity * profile(distanceRatio) * directionalMask * visibility);
        }
      }

      finalColor = vec4(clamp(illumination, 0.0, 1.0), 1.0);
    }
  `;
}

export const COMPOSE_FRAGMENT = `
  precision mediump float;

  in vec2 vTextureCoord;
  uniform sampler2D uTexture;
  uniform sampler2D uLightMap;
  uniform vec2 uImageSize;
  out vec4 finalColor;

  void main(void) {
    vec4 scene = texture(uTexture, vTextureCoord);
    vec2 lightUv = gl_FragCoord.xy / uImageSize;
    vec3 illumination = texture(uLightMap, clamp(lightUv, 0.0, 1.0)).rgb;
    finalColor = vec4(scene.rgb * illumination, scene.a);
  }
`;
