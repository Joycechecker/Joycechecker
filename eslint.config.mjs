import nextCoreVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreVitals,
  ...nextTypeScript,
  {
    ignores: ["**/._*"],
  },
];

export default config;
