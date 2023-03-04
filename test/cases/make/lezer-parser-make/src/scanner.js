// scanner.js - generated from scanner.cc
// global defines
const debug = ["1", "true"].includes(
  ("undefined" != typeof process && process.env.DEBUG_LEZER_PARSER_MAKE) ||
    globalThis.DEBUG_LEZER_PARSER_MAKE
);
const DEBUG = false;
const DEBUG_LOOPS = false;
const DEADLOOP_MAX = 30;
// lezer
import { ExternalTokenizer } from "@lezer/lr";
/** @typedef {import("@lezer/lr").InputStream} InputStream */
// @ts-ignore Cannot find module - file is generated
import * as Tokens from "./parser.terms.js";
// constants
// ascii chars
const tab = 9,
  newline = 10,
  space = 32,
  parenL = 40,
  curlyL = 123;
const spaceNums = new Set([
  9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197,
  8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288,
]);
// functions
/** @param {number} num */ const iswspace = (num) => spaceNums.has(num);
/** @param {number} num */ const /** eslint: no-unused-vars: 'iswdigit' is assigned a value but never used. */ iswdigit =
    (num) => 48 <= num && num <= 57;
/** @param {number} code */ const /** eslint: no-unused-vars: 'iswalpha' is assigned a value but never used. */ iswalpha =
    (num) => 65 <= num && num <= 122 && (num <= 90 || 97 <= num);
const abort = () => {
  throw new Error("abort");
};
/** @type {(arr: number[]) => string} */ const strArr = (arr) =>
  arr.map((num) => String.fromCharCode(num)).join("");
/** @type {(num: number) => string} */ const /** eslint: no-unused-vars: 'charNum' is assigned a value but never used. */ charNum =
    (num) => String.fromCharCode(num);
// scanner state
/** @type {number} */ let deadloop_counter = 0;
/** @type {number} */ let recipe_prefix = 0;
/// converted string to number[]
/** @type {number[]} */ let variable_operator = [];
/// converted string to number[]
/** @type {number[]} */ let variable_value = [];
export const Recipeprefix = new ExternalTokenizer((input) =>
  scan_recipeprefix(input)
);
export const RecipeprefixAssignmentOperator = new ExternalTokenizer((input) =>
  scan_recipeprefix_assignment_operator(input)
);
export const RecipeprefixAssignmentValue = new ExternalTokenizer((input) =>
  scan_recipeprefix_assignment_value(input)
);
function /** eslint: no-unused-vars: 'Scanner' is defined but never used. */ Scanner() {
  // constructor
  recipe_prefix = tab;
  deadloop_counter = 0;
}
/** @return {void} */ function skip(/** @type {InputStream} */ input) {
  /// TODO skip whitespace
  /// original call:
  /// lexer->advance(lexer, true)
  input.advance();
}
/** @return {void} */ function advance(/** @type {InputStream} */ input) {
  input.advance();
}
/** @return {number} */ function lookahead(/** @type {InputStream} */ input) {
  /// TODO return?
  return input.next;
}
/** @return {boolean} */ function scan_recipeprefix(
  /** @type {InputStream} */ input
) {
  DEBUG && console.log("scanner.cc: valid_symbols[RECIPEPREFIX]");
  if (lookahead(input) == recipe_prefix) {
    advance(input);
    input.acceptToken(Tokens.Recipeprefix);
    /// TODO return?
    return true;
  } /// TODO return?
  return false;
}
/** @return {boolean} */ function scan_recipeprefix_assignment_operator(
  /** @type {InputStream} */ input
) {
  DEBUG &&
    console.log("scanner.cc: valid_symbols[RECIPEPREFIX_ASSIGNMENT_OPERATOR]");
  /// converted string to number[]
  /// @string node ""
  variable_operator = [];
  /*
    // skip whitespace
    while (iswspace(lookahead(lexer))) {
      skip(lexer);
    }
    */
  /** @type {number} */ let next_char = lookahead(input);
  deadloop_counter = 0;
  while (!iswspace(next_char)) {
    // TODO better? this allows all non-space
    /// converted string to number[]
    /// @string node next_char
    if (debug && !("number" == typeof next_char)) {
      throw new Error(
        "type error in variable next_char: expected number, actual " +
          typeof next_char
      );
    }
    variable_operator.push(next_char);
    advance(input);
    next_char = lookahead(input);
    if (0 == next_char) {
      // eof
      /// TODO return?
      return false;
    }
    DEBUG_LOOPS && ++deadloop_counter > DEADLOOP_MAX && abort();
  }
  if (variable_operator.length > 0) {
    DEBUG &&
      console.log(
        `scanner.cc:150: variable_operator = '${strArr(variable_operator)}'`
      );
    input.acceptToken(Tokens.RecipeprefixAssignmentOperator);
    /// TODO return?
    return true;
  } /// TODO return?
  return false;
}
/** @return {boolean} */ function scan_recipeprefix_assignment_value(
  /** @type {InputStream} */ input
) {
  // this is a more specific variant of scan_variable_assignment_value
  DEBUG &&
    console.log("scanner.cc: valid_symbols[RECIPEPREFIX_ASSIGNMENT_VALUE]");
  // value of .RECIPEPREFIX variable
  // only the first char is used as indent
  // https://www.gnu.org/software/make/manual/html_node/Recipe-Syntax.html
  // popular values for RECIPEPREFIX
  // https://github.com/search?q=RECIPEPREFIX+filename%3Amakefile
  /** @type {number} */ let next_char = lookahead(input);
  //printf("scanner.cc: next_char = dec %i = '%c'\n", (int) next_char, next_char);
  // skip whitespace
  deadloop_counter = 0;
  while (iswspace(next_char) && next_char != newline) {
    DEBUG && console.log("scanner.cc: skip whitespace");
    skip(input);
    next_char = lookahead(input);
    //printf("scanner.cc: next_char = dec %i = '%c'\n", (int) next_char, next_char);
    DEBUG_LOOPS && ++deadloop_counter > DEADLOOP_MAX && abort();
  } // scan to end of line
  /// converted string to number[]
  /// @string node ""
  variable_value = [];
  next_char = lookahead(input);
  deadloop_counter = 0;
  while (next_char != newline) {
    /// converted string to number[]
    /// @string node next_char
    if (debug && !("number" == typeof next_char)) {
      throw new Error(
        "type error in variable next_char: expected number, actual " +
          typeof next_char
      );
    }
    variable_value.push(next_char);
    advance(input);
    next_char = lookahead(input);
    DEBUG_LOOPS && ++deadloop_counter > DEADLOOP_MAX && abort();
  } // set recipe_prefix
  if (0 == variable_value.length) {
    // FIXME variable_operator is not valid here
    // TODO parse only the RECIPEPREFIX assignment in scanner.cc
    // and ignore all other assignments
    // .RECIPEPREFIX +=
    // note: there is nothing after the "+="
    // backward-compatible with make 4.2 and before
    // this does not work with make 4.3 and after (2020-01-19)
    // append space to empty value -> space
    recipe_prefix = "+=" == strArr(variable_operator) ? space : tab;
  } else if (
    variable_value.length >= 2 &&
    (variable_value[1] == parenL || variable_value[1] == curlyL)
  ) {
    // variable_value is 2 or longer and starts with $( or ${
    // some ways to indent with spaces
    // see also https://stackoverflow.com/questions/2131213/can-you-make-valid-makefiles-without-tab-characters
    // these do not require keeping track of variables like $(space)
    // $() and ${} are empty and can be used as delimiters
    // we care only about the first char after $() or ${}
    // so the full value can be "$() anything"
    // can even be a parse error like "$() $(" -> error: unterminated variable reference
    // this code could be faster, but its rarely used, so we dont care
    if (
      // safe
      // this is rarely used in practice
      // .RECIPEPREFIX := $() $()
      // .RECIPEPREFIX := $() #
      "$() " == strArr(variable_value.slice(0, 4)) ||
      "${} " == strArr(variable_value.slice(0, 4)) || // risky. this assumes: .RECIPEPREFIX := $()
      // this is often used in practice
      // .RECIPEPREFIX := $(.RECIPEPREFIX) $(.RECIPEPREFIX)
      // .RECIPEPREFIX := $(.RECIPEPREFIX) #
      "$(.RECIPEPREFIX) " == strArr(variable_value.slice(0, 17)) ||
      "${.RECIPEPREFIX} " == strArr(variable_value.slice(0, 17)) || // risky. this assumes: space := $() $()
      // this is rarely used in practice
      // based on https://www.gnu.org/software/make/manual/html_node/Syntax-of-Functions.html#Special-Characters
      // space := $() $()
      // .RECIPEPREFIX := $(space)
      "$(space)" == strArr(variable_value) ||
      "${space}" == strArr(variable_value)
    ) {
      recipe_prefix = space;
    } else {
      // expression is too complex.
      // ideally we would evaluate the expression
      // but this would require keeping track of variables.
      // backtracking is not an option:
      // http://tree-sitter.github.io/tree-sitter/creating-parsers#external-scanners
      // > you cannot backtrack
      // example:
      // space_char := $() $()
      // .RECIPEPREFIX := $(space_char)
      // cheap fix: fallback to default value
      recipe_prefix = tab;
      DEBUG &&
        console.log(
          `scanner.cc: FIXME evaluate variable_value = '${strArr(
            variable_value
          )}'`
        );
    }
  } // variable_value is 1 or longer and does NOT start with $
  // value is a literal string
  // no need to eval, just take the first char
  // examples:
  // .RECIPEPREFIX := > # indent with '>'. often used in practice
  // .RECIPEPREFIX := asdf # indent with 'a'
  // .RECIPEPREFIX := \ # indent with '\\'. everything after the \ is ignored
  else {
    recipe_prefix = variable_value[0];
  }
  recipe_prefix == tab
    ? DEBUG && console.log("scanner.cc: recipe_prefix = '\\t'")
    : DEBUG && console.log(`scanner.cc: recipe_prefix = '${recipe_prefix}'`); // reset temporary variables
  /// converted string to number[]
  /// @string node ""
  variable_operator = [];
  /// converted string to number[]
  /// @string node ""
  variable_value = [];
  // no. we already are at end of line
  /*
    next_char = lookahead(lexer);
    //printf("scanner.cc: next_char = dec %i = '%c'\n", (int) next_char, next_char);
    deadloop_counter = 0;
    while (next_char != '\n') {
      advance(lexer);
      next_char = lookahead(lexer);
      //printf("scanner.cc: next_char = dec %i = '%c'\n", (int) next_char, next_char);
      if (DEBUG_LOOPS && ++deadloop_counter > DEADLOOP_MAX) abort();
    }
    */ input.acceptToken(Tokens.RecipeprefixAssignmentValue);
  /// TODO return?
  return true;
}

