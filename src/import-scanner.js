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
import { getCode, lintCode, formatCode, formatNode } from "./import-scanner/codegen.js"
import { printNode, exitNode } from './import-scanner/lezer-tree-format.js'



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

var tree = parser.parse(scannerSource)

const state = {
  source: scannerSource,
  tree,
  grammar,
  asciiNames: getAsciiNames(),
  tokensObjectName: "Tokens",
  tokenNamePrefix: "",
  // analyze ...
  usedAsciiCodes: new Set(),
  convertStringToArrayNames: new Set(),
  tokenTypeNames: [],
  structFields: {},
}

state.tokenNamePrefix = state.tokensObjectName + "."

// static analysis
analyze(tree, state)

// codegen
//let code = tree.topNode.type.format(tree.topNode, state) // too generic
let code = getCode(tree, state)
code = await lintCode(code, eslintConfig)
code = formatCode(code, prettierConfig)

// output
console.log(code)

}
