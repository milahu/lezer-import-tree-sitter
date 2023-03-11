/*

https://github.com/antlr/antlr4/blob/master/doc/javascript-target.md

generate parser:
antlr4 -Dlanguage=JavaScript antlr4/ANTLRv4Lexer.g4
antlr4 -Dlanguage=JavaScript antlr4/ANTLRv4Parser.g4

result:
antlr4/ANTLRv4Lexer.js
antlr4/ANTLRv4Parser.js
antlr4/ANTLRv4ParserListener.js

*/

import antlr4 from 'antlr4';
import ANTLRv4Lexer from './antlr/ANTLRv4Lexer.js';
import ANTLRv4Parser from './antlr/ANTLRv4Parser.js';
//import ANTLRv4ParserListener from './antlr/ANTLRv4ParserListener.js';

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
//import {getAsciiNames} from "./ascii-constants.js"
import { analyze } from "./analyze.js"
import { getCode, minifyCode, lintCode, formatCode, formatNode } from "./codegen.js"
import { printNode, exitNode } from './format.js'

// based on lezer-parser-nix/src/format-error-context.js
import { formatErrorContext } from "../format-error-context.js"



main()

async function main() {

// TODO make grammar.json optional

if (
  process.argv.length != 3 &&
  process.argv.length != 4
) {
  console.error("usage:")
  //console.error("node src/import-scanner.js path/to/scanner.cc")
  console.error("node src/import-antlr4/import-antlr4.js path/to/SomeParser.g4")
  console.error("node src/import-antlr4/import-antlr4.js path/to/SomeParser.g4 path/to/SomeLexer.g4")
  process.exit(1)
}

/*
function getEval(typeName) {
  if (!(typeName in transpileOfNodeType)) {
    throw new Error("not implemented: node.type.name = " + typeName)
  }
  return transpileOfNodeType[typeName]
}
*/

/*
for (const type of parser.nodeSet.types) {
  type.format = (node, state) => formatNode(node, state)
}
*/

function getParser(source) {
  const chars = new antlr4.InputStream(source)
  const lexer = new ANTLRv4Lexer(chars)
  const tokens = new antlr4.CommonTokenStream(lexer)
  const parser = new ANTLRv4Parser(tokens)
  return parser
}

const sourcePath = process.argv[2]
const source = readFileSync(sourcePath, "utf8")
const parser = getParser(source)
parser.buildParseTrees = true
const topRule = "grammarSpec"
const tree = parser[topRule]()

// lexer has no topRule, just a flat list of rules -> lexerParser.ruleNames
let lexerSource = null
let lexerParser = null
const lexerSourcePath = process.argv[2]
if (lexerSourcePath) {
  lexerSource = readFileSync(lexerSourcePath, "utf8")
  lexerParser = getParser(lexerSource)
}

//console.log(tree)

const state = {
  sourcePath,
  source,
  tree,
  lexerSourcePath,
  lexerSource,
  lexerParser,
}

// static analysis
const analyzeDone = analyze(tree, state)

if (analyzeDone === false) {
  return
}

// debug: analyze and exit
//console.dir(state.scannerStateVars); return

// codegen
//let code = tree.topNode.type.format(tree.topNode, state) // too generic
let code = getCode(tree, state)

// output
console.log(code)

}
