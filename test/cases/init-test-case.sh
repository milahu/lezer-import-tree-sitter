#! /usr/bin/env bash

# https://tree-sitter.github.io/tree-sitter/creating-parsers#project-setup
# https://tree-sitter.github.io/tree-sitter/creating-parsers#the-grammar-dsl
# https://github.com/Himujjal/tree-sitter-template
# https://github.com/SKalt/template-tree-sitter-grammar

set -u

cd "$(dirname "$0")"

name="$1"
# slugify
name=$(echo -n "$name" | tr '[:upper:][:punct:][:space:]' '[:lower:]--' | tr -s - -)
echo name: $name

name_snake=$(echo -n "$name" | tr - _)

mkdir -p $name
cd $name

mkdir tree-sitter-$name
cd tree-sitter-$name

cat >package.json <<EOF
{
  "name": "tree-sitter-$name",
  "version": "0.0.1",
  "description": "Tree-Sitter grammar for the $name language",
  "main": "dist/index.cjs",
  "author": "",
  "license": "MIT",
  "type": "commonjs",
  "exports": {
    "import": "./dist/index.js",
    "require": "./dist/index.cjs"
  },
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "dependencies": {
    "nan": "^2.17.0"
  },
  "devDependencies": {
    "tree-sitter-cli": "^0.20.7"
  }
}
EOF

pnpm install

cat >grammar.js <<EOF
module.exports = grammar({
  name: "$name_snake",

  externals: $ => [
    /*
    $.hello,
    */
  ],

  extras: $ => [/\s+/],

  conflicts: $ => [],

  keywords: $ => [
    //"key",
  ],

  rules: {
    document: $ => repeat($.word),
    word: $ => /[^\s]+/,
  },
});
EOF

mkdir src
cat >src/scanner.cc <<EOF
// based on https://github.com/nickel-lang/tree-sitter-nickel/blob/main/src/scanner.cc

#include <cstring>
#include <tree_sitter/parser.h>
#include <cwctype>  // iswspace
#include <stdint.h> // uint8_t, int32_t
#include <string>
#include <vector>
#include <map>

#define DEBUG false
#define DEBUG_LOOPS false
#define DEADLOOP_MAX 30



namespace {

//using std::vector;



enum TokenType {
  /*
  HELLO,
  */
};



struct Scanner {

  // state

  char recipe_prefix;

  //std::string variable_name;
  std::string token_string;
  std::string variable_value;
  //std::map<std::string, std::string> variables_map; // TODO sorted map



  Scanner() {
    // constructor
    recipe_prefix = '\t';
    deadloop_counter = 0;
  }

  unsigned serialize(char *buffer) {
    return 0;
  }

  void deserialize(const char *buffer, uint8_t length) {
  }

  inline void skip(TSLexer *lexer) {
    lexer->advance(lexer, true);
  }

  inline void advance(TSLexer *lexer) {
    lexer->advance(lexer, false);
  }

  inline int32_t lookahead(TSLexer *lexer) {
    return lexer->lookahead;
  }



  bool scan_hello(TSLexer *lexer) {

    if (DEBUG) printf("scanner.cc: valid_symbols[HELLO]\n");
    std::string token_string = "";
    /*
    // skip whitespace
    while (iswspace(lookahead(lexer))) {
      skip(lexer);
    }
    */
    char next_char = lookahead(lexer);
    int deadloop_counter = 0;
    while (!iswspace(next_char)) {
      token_string += next_char;
      advance(lexer);
      next_char = lookahead(lexer);
      if (next_char == 0) {
        // eof
        return false;
      }
      if (DEBUG_LOOPS && ++deadloop_counter > DEADLOOP_MAX) abort();
    }
    if (token_string.size() > 0) {
      if (DEBUG) printf("scanner.cc: token_string = '%s'\n", token_string.c_str());
      lexer->result_symbol = HELLO;
      return true;
    }
    return false;
  }



  bool scan(TSLexer *lexer, const bool *valid_symbols) {

    // router for all scan_* functions

    // During error recovery we don't run the external scanner. This produces
    // less accurate results, but avoids a large deal of complexity in this
    // scanner.
    if (
      // TODO keep in sync with enum TokenType
      valid_symbols[HELLO] &&
      valid_symbols[HELLO2] &&
      valid_symbols[HELLO3] &&
      valid_symbols[HELLO4] &&
      valid_symbols[HELLO5] &&
      // ...
      true
    ) {
      return false;
    }

    // Skip whitespace
    /*
    while (iswspace(lookahead(lexer))) {
      skip(lexer);
    }
    */

    if (valid_symbols[HELLO]) {
      return scan_hello(lexer);
    }

    return false;
  }

}; // struct Scanner

} // namespace



extern "C" {

void *tree_sitter_make_external_scanner_create() {
  return new Scanner();
}

void tree_sitter_make_external_scanner_destroy(void *payload) {
  Scanner *scanner = static_cast<Scanner *>(payload);
  delete scanner;
}

bool tree_sitter_make_external_scanner_scan(
    void *payload,
    TSLexer *lexer,
    const bool *valid_symbols
  ) {
  Scanner *scanner = static_cast<Scanner *>(payload);
  return scanner->scan(lexer, valid_symbols);
}

/**
 * @param Contains the scanner
 * @param Will hold the serialized state of the scanner
 */
unsigned tree_sitter_make_external_scanner_serialize(
    void *payload,
    char *buffer
  ) {
  Scanner *scanner = static_cast<Scanner *>(payload);
  return scanner->serialize(buffer);
}

/**
 * @param Contains the scanner
 * @param The serialised state of the scanner
 * @param Indicates the length of the buffer
 */
void tree_sitter_make_external_scanner_deserialize(
    void *payload,
    const char *buffer,
    unsigned length
  ) {
  Scanner *scanner = static_cast<Scanner *>(payload);
  uint8_t length_uint8 = (uint8_t)length;
  scanner->deserialize(buffer, length_uint8);
}

} // extern "C"
EOF

mkdir -p test/corpus
cat >test/corpus/hello.txt <<EOF
==================
hello node
==================

hello

---

(hello)
EOF



cd ..



# https://github.com/milahu/lezer-parser-nix

mkdir lezer-parser-$name
cd lezer-parser-$name

cat >package.json <<EOF
{
  "name": "lezer-parser-$name",
  "version": "0.0.1",
  "description": "Lezer grammar for the $name language",
  "main": "dist/index.cjs",
  "author": "",
  "license": "MIT",
  "type": "module",
  "exports": {
    "import": "./dist/index.js",
    "require": "./dist/index.cjs"
  },
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "devDependencies": {
    "@lezer/common": "^1.0.1",
    "@lezer/generator": "^1.1.1",
    "@rollup/plugin-node-resolve": "^14.1.0",
    "mocha": "^10.0.0",
    "rollup": "^2.79.0"
  },
  "dependencies": {
    "@lezer/lr": "^1.2.3"
  },
  "scripts": {
    "build": "lezer-generator src/grammar.lezer -o src/parser && rollup -c",
    "build-debug": "lezer-generator src/grammar.lezer --names -o src/parser && rollup -c",
    "prepare": "npm run build",
    "test": "mocha --experimental-modules test/test-*.js",
    "on-change": "npm run build && npm run test",
    "watch": "git ls-files | entr npm run on-change"
  }
}
EOF

# ignore-scripts: dont build grammer, because src/grammar.lezer does not-yet exist
pnpm install --ignore-scripts

cat >rollup.config.js <<EOF
import nodeResolve from "@rollup/plugin-node-resolve"

export default {
  input: "./src/index.js",
  output: [{
    format: "cjs",
    file: "./dist/index.cjs"
  }, {
    format: "es",
    file: "./dist/index.js"
  }],
  external(id) { return !/^[\.\/]/.test(id) },
  plugins: [
    nodeResolve()
  ]
}
EOF

mkdir src
cat >src/index.js <<EOF
import {parser} from "./parser"
//import * as props from "./props" // FIXME
const props = null

export {parser, props}
EOF

mkdir test
cat >test/hello.txt <<EOF
# hello node
hello
==>
Hello
EOF

# note: 'EOF' to disable string-interpolation of ${expr}
cat >test/test-parser.js <<'EOF'
import {parser} from "../dist/index.js"
import {fileTests} from "@lezer/generator/dist/test"

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from 'url';
let caseDir = path.dirname(fileURLToPath(import.meta.url))

for (let file of fs.readdirSync(caseDir)) {
  if (!/\.txt$/.test(file)) continue

  let name = /^[^\.]*/.exec(file)[0]
  describe(name, () => {
    for (let {name, run} of fileTests(fs.readFileSync(path.join(caseDir, file), "utf8"), file))
      it(name, () => run(parser))
  })
}
EOF

# note: 'EOF' to disable string-interpolation of ${expr}
cat >test/update-expressions.js <<'EOF'
// based on test-parser.js
// based on manual-test.js

import {parser} from "../dist/index.js"
import {stringifyTree} from "../src/stringify-tree.js"

// use a patched version of fileTests to parse test files
// https://github.com/lezer-parser/generator/pull/7
// https://github.com/lezer-parser/generator/blob/main/src/test.ts
//import {fileTests} from "@lezer/generator/dist/test"
function toLineContext(file, index) {
  const endEol = file.indexOf('\n', index + 80);
  const endIndex = endEol === -1 ? file.length : endEol;
  return file.substring(index, endIndex).split(/\n/).map(str => '  | ' + str).join('\n');
}

const defaultIgnore = false

function fileTests(file, fileName, mayIgnore = defaultIgnore) {
  let caseExpr = /#[ \t]*(.*)(?:\r\n|\r|\n)([^]*?)==+>([^]*?)(?:$|(?:\r\n|\r|\n)+(?=#))/gy
  let tests = []
  let lastIndex = 0;
  for (;;) {
    let m = caseExpr.exec(file)
    if (!m) throw new Error(`Unexpected file format in ${fileName} around\n\n${toLineContext(file, lastIndex)}`)
    let execResult = /(.*?)(\{.*?\})?$/.exec(m[1])
    if (execResult === null) throw Error('execResult is null')
    let [, name, configStr] = execResult

    let text = m[2].trim(), expected = m[3].trim()
    let config = configStr ? JSON.parse(configStr) : null
    let strict = !/⚠|\.\.\./.test(expected)

    tests.push({ name, text, expected, configStr, config, strict })
    lastIndex = m.index + m[0].length
    if (lastIndex == file.length) break
  }
  return tests
}

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from 'url';
let caseDir = path.dirname(fileURLToPath(import.meta.url))

const writePrettyTree = true

for (let file of fs.readdirSync(caseDir)) {
  if (!/\.txt$/.test(file)) continue
  //let fileName = /^[^\.]*/.exec(file)[0]
  let filePath = path.join(caseDir, file)
  let fileContent = fs.readFileSync(filePath, "utf8")
  const result = []
  for (let testData of fileTests(fileContent, file)) {
    const { name, text, expected: oldExpected, configStr, strict } = testData;
    const tree = parser.parse(testData.text);
    const stringifyOptions = writePrettyTree && { pretty: true, text };
    const newExpected = stringifyTree(tree, stringifyOptions).trim();
    //if (name == 'some test name') { console.dir(testData) } // debug
    result.push(`# ${name}${(configStr || '')}\n${text}\n==>\n${newExpected}`)
    const oldExpectedErrors = (oldExpected.match(/⚠/g) || []).length;
    const newExpectedErrors = (newExpected.match(/⚠/g) || []).length;
    if (oldExpectedErrors != newExpectedErrors) {
      console.log(`# ${name}\n# error count changed: ${oldExpectedErrors} -> ${newExpectedErrors}\n# old expected:\n${oldExpected}\n# new expected:\n${newExpected}\n`)
    }
  }
  const newFileContent = result.join("\n\n") + "\n";
  // TODO backup?
  console.log(`writing ${filePath}`);
  fs.writeFileSync(filePath, newFileContent, "utf8");
}
EOF

cat >src/stringify-tree.js <<'EOF'
/** @param {Tree | TreeNode} tree */

export function stringifyTree(tree, options) {

  if (!options) options = {};
  const pretty = options.pretty || false;
  const human = options.human || false; // human readable, like python or yaml
  const positions = options.positions || false; // add node positions
  const firstLine = options.firstLine || false; // show only first line of node source
  const compact = (!pretty && !human);
  const format = compact ? 'compact' : pretty ? 'pretty' : human ? 'human' : null;
  const source = options.source || options.text || '';
  const indentStep = options.indent || '  ';

  const cursor = tree.cursor();
  if (!cursor) return '';

  let depth = 0;
  let result = '';

  const indent = () => indentStep.repeat(depth);
  const cursorType = () => positions ? `${cursor.name}:${cursor.from}` : cursor.name;
  const cursorText = () => {
    let src = source.slice(cursor.from, cursor.to);
    if (firstLine) {
      return src.split('\n')[0];
    }
    return src;
  };

  const formatNodeByFormat = {
    human: () => `${indent()}${cursorType()}: ${cursorText()}\n`,
    pretty: () => `${indent()}${cursorType()}`,
    compact: () => cursorType(),
  };
  const formatNode = formatNodeByFormat[format];

  while (true) {
    // NLR: Node, Left, Right
    // Node
    result += formatNode()
    // Left
    if (cursor.firstChild()) {
      // moved down
      depth++;
      if (compact) result += '('
      if (pretty) result += ' (\n'
      continue;
    }
    // Right
    if (cursor.nextSibling()) {
      // moved right
      if (compact) result += ','
      if (pretty) result += ',\n'
      continue;
    }
    let continueMainLoop = false;
    let firstUp = true;
    while (cursor.parent()) {
      // moved up
      depth--;
      //console.log(`stringifyTree: moved up to depth=${depth}. result: ${result}`)
      if (depth < 0) {
        // when tree is a node, stop at the end of node
        // == dont visit sibling or parent nodes
        return result;
      }
      if (compact) result += ')'
      if (pretty && firstUp) result += `\n`
      if (pretty) result += `${indent()})`
      if (cursor.nextSibling()) {
        // moved up + right
        continueMainLoop = true;
        if (compact) result += ','
        if (pretty) result += ',\n'
        break;
      }
      if (pretty) result += `\n`
      firstUp = false;
    }
    if (continueMainLoop) continue;

    break;
  }

  //console.log(`stringifyTree: final depth: ${depth}`)

  return result;
}
EOF
