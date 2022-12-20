// scanner.js - generated from scanner.cc
import { ExternalTokenizer } from "@lezer/lr";
// @ts-ignore Cannot find module - file is generated
import * as Tokens from "./parser.terms.js";
// ascii chars
const end = -1,
  tab = 9,
  newline = 10,
  return_ = 13,
  space = 32,
  doubleQuotes = 34,
  hash = 35,
  dollar = 36,
  and = 38,
  singleQuote = 39,
  parenL = 40,
  parenR = 41,
  plus = 43,
  minus = 45,
  semicolon = 59,
  angleL = 60,
  equal = 61,
  angleR = 62,
  bracketL = 91,
  backslash = 92,
  bracketR = 93,
  underscore = 95,
  accent = 96,
  curlyL = 123,
  pipe = 124,
  curlyR = 125;
const spaceCodeSet = new Set([
  9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197,
  8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288,
]);
/** @param {number} code */ const iswspace = (code) => spaceCodeSet.has(code);
/** @param {number} code */ const iswdigit = (code) => 48 <= code && code <= 57;
/** @param {number} code */ const iswalpha = (code) =>
  65 <= code && code <= 122 && (code <= 90 || 97 <= code);
// scanner state
/// converted string to number[]
/** @type {number[]} */ let heredoc_delimiter = [];
let heredoc_is_raw = false;
let started_heredoc = false;
let heredoc_allows_indent = false;
/// converted string to number[]
/** @type {number[]} */ let current_leading_word = [];
export const HeredocStart = new ExternalTokenizer((input) =>
  scan_heredoc_start(input)
);
export const SimpleHeredocBody = new ExternalTokenizer(
  /* eslint: no-unused-vars: 'input' is defined but never used. */ (input) =>
    false
);
export const HeredocBodyBeginning = new ExternalTokenizer((input) => {
  if (
    /* @evaluated valid_symbols[HEREDOC_BODY_BEGINNING] */ !(
      0 == heredoc_delimiter.length || started_heredoc
    )
  ) {
    /// TODO return?
    return scan_heredoc_content(
      input,
      Tokens.HeredocBodyBeginning,
      Tokens.SimpleHeredocBody
    );
  } /// TODO return?
  return false;
});
export const HeredocBodyMiddle = new ExternalTokenizer((input) => {
  if (
    /* @evaluated valid_symbols[HEREDOC_BODY_MIDDLE] */ !(
      0 == heredoc_delimiter.length
    ) &&
    started_heredoc
  ) {
    /// TODO return?
    return scan_heredoc_content(
      input,
      Tokens.HeredocBodyMiddle,
      Tokens.HeredocBodyEnd
    );
  } /// TODO return?
  return false;
});
export const HeredocBodyEnd = new ExternalTokenizer(
  /* eslint: no-unused-vars: 'input' is defined but never used. */ (input) =>
    false
);
export const FileDescriptor = new ExternalTokenizer((input) => {
  {
    while (true) {
      if (
        input.next == space ||
        input.next == tab ||
        input.next == return_ ||
        (input.next == newline && true)
      ) {
        skip(input);
      } else {
        if (input.next != backslash) {
          break;
        }
        skip(input);
        input.next == return_ && skip(input);
        if (input.next != newline) {
          /// TODO return?
          return false;
        }
        skip(input);
      }
    }
    /** @type {bool} */
    let is_number = true;
    if (iswdigit(input.next)) {
      advance(input);
    } else {
      if (!iswalpha(input.next) && input.next != underscore) {
        /// TODO return?
        return false;
      }
      is_number = false;
      advance(input);
    }
    while (true) {
      if (iswdigit(input.next)) {
        advance(input);
      } else {
        if (!iswalpha(input.next) && input.next != underscore) {
          break;
        }
        is_number = false;
        advance(input);
      }
    }
    if (is_number && (input.next == angleR || input.next == angleL)) {
      input.acceptToken(Tokens.FileDescriptor);
      /// TODO return?
      return true;
    } /// TODO return?
    return false;
  }
});
export const EmptyValue = new ExternalTokenizer((input) => {
  if (iswspace(input.next)) {
    input.acceptToken(Tokens.EmptyValue);
    /// TODO return?
    return true;
  } /// TODO return?
  return false;
});
export const Concat = new ExternalTokenizer((input) => {
  if (
    !(
      0 == input.next ||
      iswspace(input.next) ||
      input.next == backslash ||
      input.next == angleR ||
      input.next == angleL ||
      input.next == parenR ||
      input.next == parenL ||
      input.next == semicolon ||
      input.next == and ||
      input.next == pipe ||
      input.next == accent ||
      input.next == hash ||
      (input.next == curlyR &&
        /* @evaluated valid_symbols[CLOSING_BRACE] */ false) ||
      (input.next == bracketR &&
        /* @evaluated valid_symbols[CLOSING_BRACKET] */ false)
    )
  ) {
    input.acceptToken(Tokens.Concat);
    /// TODO return?
    return true;
  } /// TODO return?
  return false;
});
export const VariableName = new ExternalTokenizer((input) => {
  {
    while (true) {
      if (
        input.next == space ||
        input.next == tab ||
        input.next == return_ ||
        (input.next == newline && true)
      ) {
        skip(input);
      } else {
        if (input.next != backslash) {
          break;
        }
        skip(input);
        input.next == return_ && skip(input);
        if (input.next != newline) {
          /// TODO return?
          return false;
        }
        skip(input);
      }
    }
    /** @type {bool} */
    let is_number = true;
    if (iswdigit(input.next)) {
      advance(input);
    } else {
      if (!iswalpha(input.next) && input.next != underscore) {
        /// TODO return?
        return false;
      }
      is_number = false;
      advance(input);
    }
    while (true) {
      if (iswdigit(input.next)) {
        advance(input);
      } else {
        if (!iswalpha(input.next) && input.next != underscore) {
          break;
        }
        is_number = false;
        advance(input);
      }
    }
    if (
      /* eslint: no-constant-condition: Unexpected constant condition. */ is_number &&
      /* @evaluated valid_symbols[FILE_DESCRIPTOR] */ false
    ) {
      input.acceptToken(Tokens.FileDescriptor);
      /// TODO return?
      return true;
    }
    if (input.next == plus) {
      /// @todo token name. original call: "lexer->mark_end(lexer)"
      input.acceptToken(
        /* eslint: no-undef: 'TODO_TOKEN_NAME' is not defined. */ TODO_TOKEN_NAME
      );
      advance(input);
      if (input.next == equal) {
        input.acceptToken(Tokens.VariableName);
        /// TODO return?
        return true;
      } /// TODO return?
      return false;
    }
    if (input.next == equal || input.next == bracketL) {
      input.acceptToken(Tokens.VariableName);
      /// TODO return?
      return true;
    } /// TODO return?
    return false;
  }
});
export const Regex = new ExternalTokenizer((input) => {
  while (iswspace(input.next)) {
    skip(input);
  }
  if (
    input.next != doubleQuotes &&
    input.next != singleQuote &&
    input.next != dollar
  ) {
    /**
     * @typedef {{
     *   done: boolean;
     *   paren_depth: number;
     *   bracket_depth: number;
     *   brace_depth: number;
     * }} State
     */
    /// @todo token name. original call: "lexer->mark_end(lexer)"
    input.acceptToken(
      /* eslint: no-undef: 'TODO_TOKEN_NAME' is not defined. */ TODO_TOKEN_NAME
    );
    /** @type {State} */ let state = {
      done: false,
      paren_depth: 0,
      bracket_depth: 0,
      brace_depth: 0,
    };
    while (!state.done) {
      switch (input.next) {
        case end:
          /// TODO return?
          return false;
        case parenL:
          state.paren_depth++;
          break;
        case bracketL:
          state.bracket_depth++;
          break;
        case curlyL:
          state.brace_depth++;
          break;
        case parenR:
          0 == state.paren_depth && (state.done = true);
          state.paren_depth--;
          break;
        case bracketR:
          0 == state.bracket_depth && (state.done = true);
          state.bracket_depth--;
          break;
        case curlyR:
          0 == state.brace_depth && (state.done = true);
          state.brace_depth--;
      }
      if (!state.done) {
        /** @type {bool} */
        let was_space = iswspace(input.next);
        advance(input);
        was_space || /// @todo token name. original call: "lexer->mark_end(lexer)"
          input.acceptToken(
            /* eslint: no-undef: 'TODO_TOKEN_NAME' is not defined. */ TODO_TOKEN_NAME
          );
      }
    }
    input.acceptToken(Tokens.Regex);
    /// TODO return?
    return true;
  } /// TODO return?
  return false;
});
export const Curlyr = new ExternalTokenizer(
  /* eslint: no-unused-vars: 'input' is defined but never used. */ (input) =>
    false
);
export const Bracketr = new ExternalTokenizer(
  /* eslint: no-unused-vars: 'input' is defined but never used. */ (input) =>
    false
);
export const AnglelAnglel = new ExternalTokenizer((input) => {
  {
    while (true) {
      if (
        input.next == space ||
        input.next == tab ||
        input.next == return_ ||
        (input.next == newline && true)
      ) {
        skip(input);
      } else {
        if (input.next != backslash) {
          break;
        }
        skip(input);
        input.next == return_ && skip(input);
        if (input.next != newline) {
          /// TODO return?
          return false;
        }
        skip(input);
      }
    }
    if (input.next == angleL) {
      advance(input);
      if (input.next == angleL) {
        advance(input);
        if (input.next == minus) {
          advance(input);
          heredoc_allows_indent = true;
          input.acceptToken(Tokens.AnglelAnglelMinus);
        } else {
          if (input.next == angleL) {
            /// TODO return?
            return false;
          } /// TODO return?
          heredoc_allows_indent = false;
          input.acceptToken(Tokens.AnglelAnglel);
        }
        return true;
      } /// TODO return?
      return false;
    }
    /** @type {bool} */ let is_number = true;
    if (iswdigit(input.next)) {
      advance(input);
    } else {
      if (!iswalpha(input.next) && input.next != underscore) {
        /// TODO return?
        return false;
      }
      is_number = false;
      advance(input);
    }
    while (true) {
      if (iswdigit(input.next)) {
        advance(input);
      } else {
        if (!iswalpha(input.next) && input.next != underscore) {
          break;
        }
        is_number = false;
        advance(input);
      }
    }
    if (
      /* eslint: no-constant-condition: Unexpected constant condition. */ is_number &&
      /* @evaluated valid_symbols[FILE_DESCRIPTOR] */ false
    ) {
      input.acceptToken(Tokens.FileDescriptor);
      /// TODO return?
      return true;
    } /// TODO return?
    return false;
  }
});
export const AnglelAnglelMinus = new ExternalTokenizer(
  /* eslint: no-unused-vars: 'input' is defined but never used. */ (input) =>
    false
);
export const Newline = new ExternalTokenizer(
  /* eslint: no-unused-vars: 'input' is defined but never used. */ (input) =>
    false
);
/** @return {
/// @todo(PrimitiveType) PrimitiveType: "void"
} */
function skip(/** @type {InputStream} */ input) {
  /// TODO skip whitespace
  /// original call:
  /// lexer->advance(lexer, true)
  input.advance();
}
/** @return {
/// @todo(PrimitiveType) PrimitiveType: "void"
} */ function advance(/** @type {InputStream} */ input) {
  input.advance();
}
/** @return {boolean} */ function scan_heredoc_start(
  /** @type {InputStream} */ input
) {
  while (iswspace(input.next)) {
    skip(input);
  }
  input.acceptToken(Tokens.HeredocStart);
  heredoc_is_raw = input.next == singleQuote;
  started_heredoc = false;
  heredoc_delimiter = [];
  input.next == backslash && advance(input) /** @type {int32_t} */;
  let quote = 0;
  if (heredoc_is_raw || input.next == doubleQuotes) {
    quote = input.next;
    advance(input);
  }
  while (iswalpha(input.next) || (0 != quote && iswspace(input.next))) {
    /// converted string to number[]
    heredoc_delimiter.push(input.next);
    advance(input);
  }
  input.next == quote && advance(input); /// TODO return?
  return !(0 == heredoc_delimiter.length);
}
/** @return {boolean} */ function scan_heredoc_end_identifier(
  /** @type {InputStream} */ input
) {
  current_leading_word = [];
  // Scan the first 'n' characters on this line, to see if they match the heredoc delimiter
  /** @type {int32_t} */ let i = 0;
  while (
    input.next != end &&
    input.next != newline &&
    /** @type {number} */ heredoc_delimiter[i++] == input.next &&
    current_leading_word.length < heredoc_delimiter.length
  ) {
    /// converted string to number[]
    current_leading_word.push(input.next);
    advance(input);
  } /// TODO return?
  return current_leading_word == heredoc_delimiter;
}
/** @return {boolean} */ function scan_heredoc_content(
  /** @type {InputStream} */ input,
  /** @type {TokenType} */ middle_type,
  /** @type {TokenType} */ end_type
) {
  /** @type {bool} */
  let did_advance = false;
  while (true) {
    switch (input.next) {
      case end:
        if (did_advance) {
          heredoc_is_raw = false;
          started_heredoc = false;
          heredoc_allows_indent = false;
          heredoc_delimiter = [];
          input.acceptToken(end_type);
          /// TODO return?
          return true;
        } /// TODO return?
        return false;
      case backslash:
        did_advance = true;
        advance(input);
        advance(input);
        break;
      case dollar:
        if (heredoc_is_raw) {
          did_advance = true;
          advance(input);
          break;
        }
        if (did_advance) {
          input.acceptToken(middle_type);
          started_heredoc = true;
          /// TODO return?
          return true;
        } /// TODO return?
        return false;
      case newline:
        did_advance = true;
        advance(input);
        if (heredoc_allows_indent) {
          while (iswspace(input.next)) {
            advance(input);
          }
        }
        if (scan_heredoc_end_identifier(input)) {
          heredoc_is_raw = false;
          started_heredoc = false;
          heredoc_allows_indent = false;
          heredoc_delimiter = [];
          input.acceptToken(end_type);
          /// TODO return?
          return true;
        }
        break;
      default:
        if (scan_heredoc_end_identifier(input)) {
          heredoc_is_raw = false;
          started_heredoc = false;
          heredoc_allows_indent = false;
          heredoc_delimiter = [];
          input.acceptToken(end_type);
          /// TODO return?
          return true;
        }
        did_advance = true;
        advance(input);
    }
  }
}

