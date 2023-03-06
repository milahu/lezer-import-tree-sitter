// TODO split API vs CLI version

/*

TODO proper handling of scopes.
currently, all state is global,
but we want to limit the scope of codemods,
because the same variable name
can have different meanings in different scopes.

TODO design:
we have two phases: analyze and codegen.

the analyze phase will ...
parse the C++ source code,
build a tree of scopes,
populate these scopes with data for the codegen phase.

data for codegen? for example:
what variables are converted from string to number[]?
what is the scope of these variables?
what C++ types are converted to typescript types?
what C++ structs are used? what is their scope?
what ascii characters are used?

the codegen phase is a tree visitor,
starting at specific entry points in the parse tree.

*/

import {readFileSync} from "fs"
import {parser as lezerCpp} from "@lezer/cpp"
import {getAsciiNames} from "./import-scanner/ascii-constants.js"
import { analyze } from "./import-scanner/analyze.js"
import { getCode, minifyCode, lintCode, formatCode, formatNode } from "./import-scanner/codegen.js"
import { printNode, exitNode } from './import-scanner/lezer-tree-format.js'

// based on lezer-parser-nix/src/format-error-context.js
import { formatErrorContext } from "./format-error-context.js"


// FIXME terser fails to remove some dead code
/*
example 1:
    if (is_number && false) { // always false
      input.acceptToken(Tokens.FileDescriptor);
      return true;
    }

example 2:
    if (
      input.next == hash ||
      (input.next == curlyR && false) // this line is always false
    ) { ... }
*/
/** @type {import("terser").MinifyOptions} */
const terserConfig = {
  module: true,
  compress: {
    // https://github.com/terser/terser#compress-options
    defaults: false, // Pass false to disable most default enabled compress transforms.
    /**/
    // FIXME this is too greedy. removes function calls to 
    evaluate: true, // attempt to evaluate constant expressions
    dead_code: true, // remove dead code (unreachable code)
    side_effects: true, // Remove expressions which have no side effects and whose results aren't used
    conditionals: true, // partial eval of conditions
    //booleans: true, // false -> 0, true -> 1
    comparisons: true, // ?
    switches: true, // de-duplicate and remove unreachable switch branches
    passes: 10, // maximum number of times to run compress
    inline: true, // inline calls to function with simple/return statement
    //comments: "all", // FIXME this breaks "evaluate":
    // variable_operator.push(...[next_char]); // actual
    // variable_operator.push(next_char); // expected
    // workaround: use jsdoc comments in commentBlock? /** ... */ instead of /* ... */
    /*
    booleans_as_integers: false, // false -> 0, true -> 1
    toplevel: true, // drop unreferenced functions ("funcs") and/or variables ("vars") in the top level scope (false by default, true to drop both unreferenced functions and variables)
    unused: true, // drop unreferenced functions and variables
    top_retain: ["f1", "f2"], // prevent specific toplevel functions and variables from unused removal (can be array, comma-separated, RegExp or function. Implies toplevel)
    module: true, // Pass true when compressing an ES6 module
    sequences: true, // code blocks to expressions
    collapse_vars: true,
    arrows: false,
    arguments: false,
    collapse_vars: false,
    computed_props: false,
    directives: false,
    drop_console: false,
    drop_debugger: false,
    ecma: false,
    */
  },
  mangle: false,
  output: {
    wrap_iife: false,
    // FIXME keep whitespace (newlines after comments)
    comments: true,
    indent_level: 2,
  },
  parse: {},
  rename: false,
}

const eslintConfig = {
  "extends": [
    "eslint:recommended",
  ],
  //"parser": "@typescript-eslint/parser",
  "parserOptions": {
    "sourceType": "module",
    "ecmaVersion": "latest",
    //"project": "./jsconfig.json", // slow
    // 30 seconds vs 6 seconds = 5x slower
  },
  "env": {
    "es2022": true,
    "browser": true,
    "node": true,
  },
  "plugins": [
    //"@typescript-eslint", // slow
    //"eslint-plugin-jsdoc", // TODO remove?
  ],
  "rules": {
    //"no-unused-vars": "off",
    // good: while (true)
    // bad: if (true)
    "no-constant-condition": ["error", { "checkLoops": false }],
    "curly": ["error", "all"],
    // TODO remove?
    // FIXME not working
    // requires parserOptions.project
    //"@typescript-eslint/restrict-plus-operands": "error", // slow
    // TODO remove?
    //"@eslint-plugin-jsdoc/check-types": "error",
  }
}

const prettierConfig = {} // TODO



main()

async function main() {

// TODO make grammar.json optional

if (
  //process.argv.length != 3 &&
  process.argv.length != 4
) {
  console.error("usage:")
  //console.error("node src/import-scanner.js path/to/scanner.cc")
  console.error("node src/import-scanner.js path/to/scanner.cc path/to/grammar.json")
  process.exit(1)
}


const parser = lezerCpp.configure({
  strict: true, // throw on parse error
})

/*
function getEval(typeName) {
  if (!(typeName in transpileOfNodeType)) {
    throw new Error("not implemented: node.type.name = " + typeName)
  }
  return transpileOfNodeType[typeName]
}
*/

for (const type of parser.nodeSet.types) {
  //type.transpile = transpileOfNodeType[type.name]
  //type.transpile = (node) => getEval(type.name)(node)
  // @ts-ignore Property 'transpile' does not exist on type 'NodeType'. ts(2339)
  type.format = (node, state) => formatNode(node, state)
}

const scannerSource = readFileSync(process.argv[2], "utf8")
//const scannerSource = readFileSync(process.argv[2]) // TypeError: this.input.chunk is not a function

const grammarSource = readFileSync(process.argv[3], "utf8")
const grammar = JSON.parse(grammarSource)

var tree = null;
try {
  tree = parser.parse(scannerSource)
}
catch (error) {
  if (error instanceof SyntaxError) {
    console.log("mkay")
    var match = error.message.match(/^No parse at ([0-9]+)$/);
    if (match) {
      const errorIndex = parseInt(match[1]);
      error.message += "\n" + formatErrorContext(scannerSource, errorIndex);
    }
  }
  throw error;
}

const state = {
  source: scannerSource,
  tree,
  grammar,
  asciiNames: getAsciiNames(),
  tokensObjectName: "Tokens",
  tokenNamePrefix: "",
  inputNextWorkaround: false,
  ignoreScannerMethods: new Set(["serialize", "deserialize"]),
  // analyze ...
  usedAsciiCodes: new Set(),
  convertStringToArrayNames: new Set(),
  tokenTypeNames: [],
  structFields: {},
}

//state.asciiNames["-1"] = "eof" // lezer-parser
state.asciiNames["-1"] = "end" // lezer-parser

state.tokenNamePrefix = state.tokensObjectName + "."

// debug: parse and exit
//printNode(tree, state); return

// static analysis
analyze(tree, state)
//console.error(`import-scanner.js: state.convertStringToArrayNames = ${state.convertStringToArrayNames}`)

if (state.tokenTypeNames.length == 0) {
  console.error("import-scanner: no external tokens")
  return
}

// debug: analyze and exit
//console.dir(state.scannerStateVars); return

// codegen
//let code = tree.topNode.type.format(tree.topNode, state) // too generic
let code = getCode(tree, state)

const returnRawCode = false

if (!returnRawCode) {
  code = await minifyCode(code, terserConfig) // remove dead code
  code = await lintCode(code, eslintConfig)
  code = formatCode(code, prettierConfig)
}

// output
console.log(code)

}
