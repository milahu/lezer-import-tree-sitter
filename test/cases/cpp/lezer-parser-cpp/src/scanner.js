// scanner.js - generated from scanner.cc
import { ExternalTokenizer } from "@lezer/lr";
// @ts-ignore Cannot find module - file is generated
import * as Tokens from "./parser.terms.js";
// ascii chars
const doubleQuotes = 34,
  parenL = 40,
  parenR = 41,
  number8 = 56,
  bigL = 76,
  bigR = 82,
  bigU = 85,
  backslash = 92,
  smallU = 117;
const spaceCodeSet = new Set([
  9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197,
  8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288,
]);
/** @param {number} code */ const iswspace = (code) => spaceCodeSet.has(code);
/** @param {number} code */ const /* eslint: no-unused-vars: 'iswdigit' is assigned a value but never used. */ iswdigit =
    (code) => 48 <= code && code <= 57;
/** @param {number} code */ const /* eslint: no-unused-vars: 'iswalpha' is assigned a value but never used. */ iswalpha =
    (code) => 65 <= code && code <= 122 && (code <= 90 || 97 <= code);
export const RawStringLiteral = new ExternalTokenizer((input) => {
  while (iswspace(input.next)) {
    /// TODO skip whitespace
    /// original call:
    /// lexer->advance(lexer, true)
    input.advance();
  }
  input.acceptToken(Tokens.RawStringLiteral);
  // Raw string literals can start with: R, LR, uR, UR, u8R
  // Consume 'R'
  if (input.next == bigL || input.next == bigU) {
    input.advance();
    if (input.next != bigR) {
      /// TODO return?
      return false;
    }
  } else if (input.next == smallU) {
    input.advance();
    if (input.next == number8) {
      input.advance();
      if (input.next != bigR) {
        /// TODO return?
        return false;
      }
    } else if (input.next != bigR) {
      /// TODO return?
      return false;
    }
  } else if (input.next != bigR) {
    /// TODO return?
    return false;
  }
  input.advance();
  // Consume '"'
  if (input.next != doubleQuotes) {
    /// TODO return?
    return false;
  }
  input.advance();
  // Consume '(', delimiter
  /** @type {number[]} */ const delimiter = [];
  while (true) {
    if (0 == input.next || input.next == backslash || iswspace(input.next)) {
      /// TODO return?
      return false;
    }
    if (input.next == parenL) {
      input.advance();
      break;
    } /// converted string to number[]
    delimiter.push(input.next);
    input.advance();
  }
  // Consume content, delimiter, ')', '"'
  /** @type {number} */ let delimiter_index = -1;
  while (true) {
    if (0 == input.next) {
      /// TODO return?
      return false;
    }
    if (delimiter_index >= 0) {
      if (delimiter_index == delimiter.length) {
        if (input.next == doubleQuotes) {
          input.advance();
          /// TODO return?
          return true;
        }
        delimiter_index = -1;
      } else {
        input.next == delimiter[delimiter_index]
          ? delimiter_index++
          : (delimiter_index = -1);
      }
    }
    -1 == delimiter_index && input.next == parenR && (delimiter_index = 0);
    input.advance();
  }
});

