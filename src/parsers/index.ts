import type { OutputParser } from "../core/types.js";
import { eslintParser } from "./eslint.js";
import { genericParser } from "./generic.js";
import { gitParser } from "./git.js";
import { pkgInstallParser } from "./pkg-install.js";
import { pytestParser } from "./pytest.js";
import { tscParser } from "./tsc.js";
import { vitestJestParser } from "./vitest-jest.js";

export const builtinParsers: OutputParser[] = [
  vitestJestParser,
  pytestParser,
  tscParser,
  eslintParser,
  pkgInstallParser,
  gitParser,
  genericParser,
];

export {
  vitestJestParser,
  pytestParser,
  tscParser,
  eslintParser,
  pkgInstallParser,
  gitParser,
  genericParser,
};
