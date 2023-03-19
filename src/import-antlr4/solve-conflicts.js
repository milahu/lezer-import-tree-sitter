/*
note: parsing is left-associative by default in ANTLR4.
in contrast, lezer-parser can throw conflict errors,
which require adding explicit "@left" precedence markers.

in ANTLR4, right-associative parsing works
by adding a "<assoc=right>" marker before the rule.
https://github.com/antlr/antlr4/blob/master/doc/left-recursion.md

e : e '*' e
  | e '+' e
  | <assoc=right> e '?' e ':' e
  | <assoc=right> e '=' e
  | INT
  ;



FIXME conflict.input can start with "…"

*/

import fs from "fs"
import path, { parse } from "path"
import child_process from "child_process"

import * as antlrFormat from "./format.js"

import antlr4 from 'antlr4';

import lodash from "lodash"

// TODO feature request to https://github.com/lezer-parser/lezer/issues
// export "class Input", maybe rename to GrammarInput
// and/or export "function parseGrammar" with type: (text: string, name: string) => AST
import { buildParser, Input as LezerGrammarInput } from "../lezer-generator.js"
//import { assert } from "console"
import MagicString from "magic-string";

import { formatErrorContext } from "../format-error-context.js"
import { assert } from "../lib/assert.js";



// global state
const oldTokens = new Set()

// lower value -> higher risk of collisions and deadloops
// higher value -> higher risk of deadloops
// TODO linear token generator -> no deadloops
//const randomMax = 5
const randomMax = 2 // deadloop?
//const randomMax = 3

main()



async function main() {

const lezerGrammarPath = process.argv[2]
let lezerGrammarText = fs.readFileSync(lezerGrammarPath, "utf8")
const lezerGrammarTextFirst = lezerGrammarText



// loop grammar generations

for (let grammarGeneration = 0; true; grammarGeneration++) {

console.log(`grammarGeneration ${grammarGeneration}`)

const grammarMagicString = new MagicString(lezerGrammarText)



// @lezer/generator:
//
// class Builder {
//     constructor(text, options) {
//         time("Parse", () => {
//             this.input = new Input(text, options.fileName);
//             this.ast = this.input.parse();
//         });

function parseLezerGrammar(lezerGrammarText, filePath = "grammar.lezer") {
  try {
    return new LezerGrammarInput(lezerGrammarText, filePath).parse()
  }
  catch (error) {
    //console.log(`error.constructor?.name`, error.constructor?.name)
    //console.log(`error.message`, error.message)
    if (error.constructor?.name == "GenError") {
      if (error.message.startsWith("Unexpected token")) {
        // pretty-print error with context
        // example: GenError: Unexpected token '(' (grammar.lezer 726:3)
        // see also: formatErrorContext
        const [_, tq, t1, t2, file, line, column] = error.message.match(/^Unexpected token ('(.*?)'|"(.*?)") \((.*?) (\d+):(\d+)\)$/)
        const lezerGrammarLines = lezerGrammarText.split("\n")
        const numLines = 10
        const contextLines = lezerGrammarLines.slice(+line - numLines, +line)
        const errorContext = [
          "-".repeat(20),
          contextLines.join("\n"),
          " ".repeat(+column) + "^",
          "-".repeat(20),
        ].join("\n")
        error.message = errorContext + "\n\n" + error.message
      }
    }
    throw error
  }
}

//console.log(`parsing grammar ...`)
const lezerGrammar = parseLezerGrammar(lezerGrammarText)
//console.log("lezerGrammar:"); console.dir(lezerGrammar, {depth: 10}); return
//console.log(`parsing grammar done`)



function buildLezerParser(lezerGrammarText) {
  try {
    const parser = buildParser(lezerGrammarText)
    return {
      parser,
      error: null,
    }
  }
  catch (error) {
    if (
      error.constructor?.name != "GenError" ||
      !error.conflicts
    ) {
      throw error
    }
    return {
      parser: null,
      error,
    }
    // error.conflicts[0].error
    // error.conflicts[0].rules
    // error.conflicts[0].term // TODO term.start is conflict location in grammar text
  }
}



// this is slow on large grammars
// TODO write a faster @lezer/generator in native code (Rust),
// based on tree-sitter generator
// https://github.com/tree-sitter/tree-sitter/tree/master/cli/src/generate
console.log(`building parser ...`)
const parserResult = buildLezerParser(lezerGrammarText)
console.log(`building parser done`)

if (!parserResult.error) {
  console.log("no conflicts -> done")
  break // stop: loop grammar generations
}

const lezerGeneratorError = parserResult.error

//console.log("lezerGeneratorError:"); console.log(lezerGeneratorError)
console.log("lezerGeneratorError.message:"); console.log(lezerGeneratorError.message)



// parse conflicts, delimited by "\n\n"
// TODO better?
/*
const conflicts = []
lezerGeneratorError.message.replace(
  /(?:^|\n)(\w+)\/(\w+) conflict between\n  ([^\n]+)\nand\n  ([^\n]+)\nWith input:\n  ([^\n]+)\nShared origin: (.*?)(?:\n\n|$)/sg,
  (_match, op1, op2, solution1, solution2, input, sharedOrigin) => {
    conflicts.push({ops: [op1, op2], solutions: [solution1, solution2], input, sharedOrigin})
  }
)
*/

//console.log("conflicts:"); console.log(conflicts)



// loop conflicts
let doneFirstConflict = false
for (const conflict of lezerGeneratorError.conflicts) {

  if (doneFirstConflict) console.log("---")

  console.log(`conflict:`); console.dir(conflict)

  // trim because input can start with " · "
  conflict.inputTokens = conflict.input.trim().split(" ")
  console.log(`conflict.inputTokens:`, conflict.inputTokens)
  // "·" = conflict position between 2 tokens,
  // usually left of the "problematic" token

  //console.log(`conflict.solutions:`, conflict.solutions); return

  // TODO use raw data from lezerGeneratorError.conflicts
  // convert to string for compatibility with old code
  conflict.solutions = conflict.solutions.map(solution => String(solution))

  // FIXME tokens[0] == "·"
  if (conflict.solutions.find(solution => solution.startsWith(" · "))) {
    console.log(`FIXME tokens[0] == "·"`)
    // skip this conflict
    continue
  }

  conflict.solutions = conflict.solutions.map((text, idx) => {
    const op = conflict.ops[idx]
    // trim empty solution "expr -> "
    const tokens = text.trim().split(" ")
    const source = tokens.shift()
    assert(tokens.shift() == "->")
    const isEmpty = (tokens.length == 0)
    if (isEmpty) {
      return {
        op,
        text,
        source,
        tokens,
        leftOverlap: 0,
        rightOverlap: 0,
        isLeft: false,
        isRight: false,
        isEmpty,
        resultText: "",
      }
    }
    // is left solution?
    let leftOverlap = 0
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] == conflict.inputTokens[i]) {
        leftOverlap++
      }
      else {
        break
      }
    }
    const isLeft = tokens.length == leftOverlap

    // is right solution?
    // right-most token always overlaps with right-most inputToken "…"
    // -> right-most index is (tokens.length - 2)
    let rightOverlap = 1
    // skip right-most tokens in the right solution
    // solution can be longer than 3 tokens
    // overlap is always only 3 tokens
    // (4 tokens when also counting the position marker "·")
    // see also test/import-antlr4/test-prec-right/readme.md
    //console.log(`160 tokens:`, tokens)
    let skipRightTokens
    for (skipRightTokens = 1; skipRightTokens < (tokens.length - 1); skipRightTokens++) {
      rightOverlap = 1
      const rightOffset = conflict.inputTokens.length - tokens.length - 1 + skipRightTokens
      /*
      console.log(`rightOffset:`, rightOffset)
      console.log(`right overlap: skipTokens=${skipRightTokens}`)
      const tokStr = tokens.slice(0, (tokens.length - 1 - skipRightTokens + 1)).join(" ")
      const inpStr = conflict.inputTokens.slice(0, -1).join(" ")
      const maxLen = Math.max(tokStr.length, inpStr.length)
      console.log(`tokens:`, tokStr.padStart(maxLen) + "   " + tokens.slice((tokens.length - 1 - skipRightTokens + 1)).join(" "))
      console.log(`input :`, inpStr.padStart(maxLen) + "   …")
      */
      for (let i = (tokens.length - 1 - skipRightTokens); i >= 0; i--) {
        //console.log(`right overlap ${i}: ${tokens[i]} vs ${conflict.inputTokens[rightOffset + i]}`)
        if (tokens[i] == conflict.inputTokens[rightOffset + i]) {
          rightOverlap++
        }
        else {
          break
        }
      }
      if (rightOverlap == 4) {
        //console.log(`right overlap: done at skipTokens=${skipRightTokens}`)
        break
      }
    }
    //const isRight = tokens.length == rightOverlap
    const isRight = (rightOverlap == 4)
    //console.log(`190 tokens:`); console.dir({ tokens, inputTokens: conflict.inputTokens, leftOverlap, rightOverlap })
    assert(leftOverlap != rightOverlap)
    if (isRight) {
      //console.log(`patching inputTokens. before:`, conflict.inputTokens.join(" "))
      // patch the right-most input token
      assert(conflict.inputTokens.slice(-1)[0] == "…")
      conflict.inputTokens.pop()
      // pushing all tokens is too much
      conflict.inputTokens.push(...tokens.slice(tokens.length - skipRightTokens))
      // push only 1 token, to match the expected resultText
      //conflict.inputTokens.push(tokens[tokens.length - skipRightTokens])
      //console.log(`patching inputTokens. after :`, conflict.inputTokens.join(" "))
    }

    const resultText = ((isLeft) => {
      if (isLeft) {
        // format result nodes with parens
        // (tokens.length + 1) to remove the conflict position "·"
        return "(" + tokens.join(" ") + ") " + conflict.inputTokens.slice(tokens.length + 1).join(" ")
      }
      // FIXME tokens[0] == "·"
      assert(tokens[1] == "·", () => {
        console.log("conflict:", conflict)
        console.log("tokens:", tokens)
        console.log("conflict.inputTokens:", conflict.inputTokens)
      })
      return (
        conflict.inputTokens.slice(0, conflict.inputTokens.length - tokens.length).join(" ") +
        " (" +
        (tokens.slice(0, 1).concat(tokens.slice(2))).join(" ") +
        ")"
      )
    })(isLeft)

    return {
      op,
      text,
      source,
      tokens,
      leftOverlap,
      rightOverlap,
      isLeft,
      isRight,
      isEmpty,
      resultText,
    }
  })
  console.log(`conflict.solutions:`, conflict.solutions)

  conflict.emptySolutionIdx = conflict.solutions.findIndex(solution => solution.isEmpty)
  conflict.hasEmptySolution = (conflict.emptySolutionIdx != -1)
  if (conflict.hasEmptySolution) {
    // expected: solution 2 is empty
    assert(conflict.emptySolutionIdx)
  }



  if (!conflict.hasEmptySolution) {

  conflict.originLines = conflict.origin.split("\n")

  const originTopName = conflict.originLines[0].trim().split(" ")[0]
  //conflict.originTree = createNode(originTopName)
  conflict.originTrees = []
  let originTreeIdx = 0
  conflict.originTrees[originTreeIdx] = createNode(originTopName)

  let node = conflict.originTrees[originTreeIdx]

  let lastLineIndent = ""
  let skipThisConflict = false
  let firstLineNextParentIdx = -1

  for (const originLine of conflict.originLines) {

    console.log(`originLine: ${originLine}`)
    const [_, lineIndent, lineRest] = originLine.match(/^( *)(.*)$/)
    //console.log(`lineRest: ${lineRest}`)

    if (lineIndent.length < lastLineIndent.length) {
      // on decrease of lineIndent, go to next originTree
      console.log(`indent decreased from ${lastLineIndent.length} to ${lineIndent.length} -> next originTree`)
      assert(lineIndent.length == 2)
      originTreeIdx++
      // copy the root node
      conflict.originTrees[originTreeIdx] = {
        ...conflict.originTrees[0]
      }
      node = conflict.originTrees[originTreeIdx]
      node.children = conflict.originTrees[0].children.map(node => {
        const copy = { ...node }
        copy.children = []
        return copy
      })
      console.log(`originTree 1:`, conflict.originTrees[0])
      console.log(`originTree 2:`, conflict.originTrees[1])
      console.log(`rootNode 2:`, node)
      console.log(`firstLineNextParentIdx:`, firstLineNextParentIdx)
      node = node.children[firstLineNextParentIdx]
    }

    console.log(`node:`, node)

    const lineTokens = lineRest.trim().split(" ")
    console.log(`lineTokens:`, lineTokens)

    // skip "via" prefix
    // all lines (except the first line and last line) start with "via " -> ignore
    if (lineTokens[0] == "via") {
      lineTokens.shift()
    }

    // skip rule name
    lineTokens.shift()

    // skip rule arrow
    assert(lineTokens[0] == "->")
    lineTokens.shift()

    let nextParentIdx = -1
    for (const token of lineTokens) {
      if (token == "·") {
        // next token is next parent
        nextParentIdx = node.children.length
        if (firstLineNextParentIdx == -1) {
          firstLineNextParentIdx = nextParentIdx
        }
        // skip this token
        continue
      }
      node.children.push(createNode(token))
    }
    if (nextParentIdx == -1) {
      throw new Error(`not found next parent node in originLine: ${originLine}`)
    }
    //console.log(`nextParentIdx: ${nextParentIdx}`)
    node = node.children[nextParentIdx]
    lastLineIndent = lineIndent
  }

  if (skipThisConflict) {
    continue
  }


  // note: this tree is derived only from conflict.origin
  // but source of truth is conflict.inputTokens

  // note: wrong tree. some nodes have wrong associativity
  // -> source of truth is conflict.inputTokens
  // but the "wrong tree" is no problem,
  // because we simply join all nodes to a string
  console.log("conflict.originTrees:"); console.dir(conflict.originTrees, {depth: null})

  // TODO generate many samples
  //conflict.originSample = getOriginSample(conflict.originTree, lezerGrammar)

  //console.log("conflict.originSample:"); console.log(conflict.originSample)

  // every sample is different
  //for (let i = 0; i < 10; i++) {
  //  console.log(`conflict.originSample ${i}:`, getOriginSample(conflict.originTree, lezerGrammar))
  //}



  // parse originSample with ANTLR parser
  // to get the expected parse tree

  if (!(process.argv[3] || "").endsWith(".g4")) {
    console.error(`warning: argv[3] should end with ".g4"`)
  }

  if (!fs.existsSync(process.argv[3])) {
    console.error(`error: no such file: argv[3]: ${argv[3]}`)
    return 1
  }

  const antlrBasePath = path.resolve(process.cwd(), process.argv[3]).replace(/^(.*?)(Lexer)?\.g4$/, "$1")
  console.log(`antlrBasePath:`, antlrBasePath)

  const antlrLexerPath = antlrBasePath + "Lexer.js"
  const antlrParserPath = antlrBasePath + "Parser.js"

  const hasExtraLexer = fs.existsSync(process.argv[4])

  if (hasExtraLexer) {
    if (!(process.argv[3] || "").endsWith("Lexer.g4")) {
      console.error(`warning: argv[3] should end with "Lexer.g4"`)
    }
    if (!(process.argv[4] || "").endsWith("Parser.g4")) {
      console.error(`warning: argv[4] should end with "Parser.g4"`)
    }
  }

  if (
    !fs.existsSync(antlrLexerPath) ||
    !fs.existsSync(antlrParserPath)
  ) {
    console.log(`generating antlr4 Lexer.js and Parser.js`)
    const g4Files = [process.argv[3]]
    if (hasExtraLexer) {
      g4Files.push(process.argv[4])
    }
    for (const g4File of g4Files) {
      console.log(`antl4 -Dlanguage=JavaScript "${g4File}"`)
      const commandName = "antlr4"
      const processResult = child_process.spawnSync(
        commandName, [
          "-Dlanguage=JavaScript",
          g4File,
        ], {
          stdio: "inherit",
          //encoding: "utf8",
          windowsHide: true,
        }
      )
      if (processResult.error) {
        if (processResult.error.code == "ENOENT") {
          console.error(`error: no such command: ${commandName}`)
          return 127
        }
        throw processResult.error
      }
      if (processResult.status != 0) {
        console.error(`error: command ${commandName} failed with status ${processResult.status}`)
        return processResult.status
      }
    }
  }

  const antlrLexerModule = await import(antlrLexerPath)
  const antlrParserModule = await import(antlrParserPath)

  function getANTLRParser(source) {
    const chars = new antlr4.InputStream(source)
    const lexer = new antlrLexerModule.default(chars)
    const tokens = new antlr4.CommonTokenStream(lexer)
    const parser = new antlrParserModule.default(tokens)
    return parser
  }

  if (conflict.originTrees.length == 2) {
    console.log(`TODO handle 2 originTrees`)
  }

  // origin tree loop
  for (const originTree of conflict.originTrees) {

    console.log(`origin tree loop: originTree:`, originTree)

    // origin samples loop
    //const originSampleIdxMax = 100
    const originSampleIdxMax = 10
    for (let originSampleIdx = 0; originSampleIdx < originSampleIdxMax; originSampleIdx++) {
      console.log(`origin tree loop: getOriginSample ...`)
      const originSample = getOriginSample(originTree, lezerGrammar)
      console.log(`origin tree loop: getOriginSample done`)

      console.log(`origin sample ${originSampleIdx}: input:`, conflict.inputTokens.join(" "))
      console.log(`origin sample ${originSampleIdx}: sample:`, originSample)

      // TODO why "no viable alternative at input"? why different input than originSample?
      const antlrParser = getANTLRParser(originSample)
      antlrParser.buildParseTrees = true
      // TODO verify topRule. maybe we must use the topRule of sharedOrigin
      const topRule = antlrParser.ruleNames[0]
      const tree = antlrParser[topRule]()

      const state = { source: originSample }
      //console.log("antlr tree:"); antlrFormat.printNode(tree, state)

      const antlrResultText = formatAntlrNode(tree)

      console.log(`origin sample ${originSampleIdx}: solution 1:`, conflict.solutions[0].resultText)
      console.log(`origin sample ${originSampleIdx}: expected  :`, antlrResultText)
      console.log(`origin sample ${originSampleIdx}: solution 2:`, conflict.solutions[1].resultText)

      let solution = conflict.solutions.find(solution => (
        solution.resultText != null &&
        (
          solution.resultText.toLowerCase().slice(0, antlrResultText.length) == antlrResultText.toLowerCase() ||
          `(${solution.resultText}) "<EOF>"`.toLowerCase() == antlrResultText.toLowerCase()
        )
      ))

      /*
      if (!solution) {
        // TODO why?
        solution = conflict.solutions.find(solution => solution.resultText == null)
      }
      */

      if (!solution) {
        console.log(`origin sample ${originSampleIdx}: no solution was found`)
        continue
        //console.log("conflict"); console.dir(conflict, {depth: 3})
        //return 1
      }

      const solutionIdx = conflict.solutions.indexOf(solution)
      console.log(`origin sample ${originSampleIdx}: using solution ${solutionIdx + 1}`)
      //console.log("solution:", solution)
      conflict.solution = solution
      break

    } // origin samples loop

  } // origin tree loop

  } // if (!conflict.hasEmptySolution)



  function getLezerName(name) {
    if (name.endsWith("Context")) {
      name = name.slice(0, -1*"Context".length)
    }
    return name
  }

  function formatAntlrNode(node, verbose = false, doneRoot = false) {
    const name = getLezerName(node.constructor.name)
    if (node.children) {
      if (node.children.length == 1 && node.children[0].constructor.name == "c") {
        if (verbose) {
          return name + "=" + formatAntlrNode(node.children[0], verbose, true)
        }
        return name
      }
      const body = node.children.map(child => formatAntlrNode(child, verbose, true)).join(" ")
      if (doneRoot) {
        return "(" + body + ")"
      }
      // root node has no parens
      return body
    }
    if (name == "c") {
      return JSON.stringify(node.getText())
    }
    return name
  }



  if (!conflict.solution) {
    // brute force: try some solutions, compare parse trees
    console.log(`no solution was found. trying solution candidates`)
    conflict.solutionCandidates = [
      {
        isLeft: true,
      },
      {
        isOnlyPrecedence: true,
      },
      {
        isRight: true,
      },
      {
        isAmbiguity: true,
      },
    ]

    conflict.solutionCandidates = conflict.solutionCandidates.map(solution => {
      const grammarMagicString = new MagicString(lezerGrammarText)
      applySolution(conflict, solution, grammarMagicString, lezerGrammar)
      const lezerGrammarTextFixed = grammarMagicString.toString()
      console.log(`lezerGrammarTextFixed:`)
      console.log("-".repeat(20))
      console.log(lezerGrammarTextFixed)
      console.log("-".repeat(20))
      console.log(`building parser ...`)
      solution.parserResult = buildLezerParser(lezerGrammarTextFixed)
      console.log(`building parser done`)
      return solution
    })

    conflict.workingSolutions = conflict.solutionCandidates.filter(solution => solution.parserResult.parser)

    if (conflict.workingSolutions.length == 0) {
      throw new Error("not found conflict.workingSolutions")
    }

    console.log(`found ${conflict.workingSolutions.length} solutions from ${conflict.solutionCandidates.length} candidates:`)
    console.log("conflict.workingSolutions:")
    console.log(conflict.workingSolutions)

    console.log("using the first working solution")
    conflict.solution = conflict.workingSolutions[0]
  }

  // add precedence marker to lezer grammar
  //console.log("lezerGrammar:"); console.log(lezerGrammar)

  applySolution(conflict, conflict.solution, grammarMagicString, lezerGrammar)

  doneFirstConflict = true

} // loop conflicts



const lezerGrammarTextPrevious = lezerGrammarText
lezerGrammarText = grammarMagicString.toString()

if (lezerGrammarTextPrevious == lezerGrammarText) {
  console.log(`no change. stopping the grammar generations loop`)
  break // stop: loop grammar generations
}

console.log("------")

} // loop grammar generations



if (lezerGrammarTextFirst == lezerGrammarText) {
  console.log(`main: no change`)
  return 0
}



const fixedExtension = ".fixed"
const lezerGrammarPathFixed = lezerGrammarPath + fixedExtension
fs.writeFileSync(lezerGrammarPathFixed, lezerGrammarText, "utf8")

console.log("------")
console.log(`done ${lezerGrammarPathFixed}`)
console.log(`compare:`)
console.log(`diff -u --color=auto ${lezerGrammarPath}{,${fixedExtension}}`)
console.log(`replace:`)
console.log(`mv -v ${lezerGrammarPath}{${fixedExtension},}`)



/////////////////////////////////////////////////////////



function createNode(name, children = []) {
  return { name, children }
}

function todoReduceRuleNodeHandler(node) {
  console.log(`TODO: add to reduceRuleNodeHandlers:
    ${node.constructor.name}(node, depth, parent, key) {
      if (depth < 0) return
      return
    },
  `)
  console.log("node:")
  console.dir(node)
  throw new Error(`not implemented: node name: ${node.constructor.name}`)
}



// bottom-up evaluator
// broad-first search
// first pass: replace references to other rules
// TODO cache result, dont re-visit fully-reduced tree
function reduceRuleNodeInner(node, maxDepth = 100, depth = 0, globalState = {}, parent, key, lezerGrammar) {
  //console.log(`reduce ${maxDepth}: ${" ".repeat(depth)}${node.constructor.name} ${node.start}`)
  //console.log(`reduce ${maxDepth}:`, node)
  //console.log(`reduce ${maxDepth}:`, new Error("loc").stack)
  const terminalNames = new Set([
    "TokenWrapper",
    "ReducedExprWrapper",
    "SetExpression",
    "LiteralExpression",
  ])
  class ReducedExprWrapper {
    constructor(expr) {
      this.expr = expr
      this.start = expr.start
    }
  }
  class TokenWrapper {
    constructor(token, start) {
      this.token = token
      this.start = start
    }
  }
  const reduceRuleNodeHandlers = {
    RuleDeclaration(node, depth, parent, key, lezerGrammar) { // root node
      if (depth > maxDepth) return
      const child = node.expr
      if (terminalNames.has(child.constructor.name)) {
        parent[key] = child
        globalState.reduced = true
        return
      }
      reduceRuleNodeInner(child, maxDepth, depth+1, globalState, node, "expr", lezerGrammar)
    },
    ChoiceExpression(node, depth, parent, key, lezerGrammar) {
      if (depth > maxDepth) return
      //console.log("ChoiceExpression: node.exprs:"); console.log(node.exprs)
      const firstTerminal = node.exprs.find(child => terminalNames.has(child.constructor.name))
      if (firstTerminal) {
        // reduce
        parent[key] = firstTerminal
        globalState.reduced = true
        return
      }
      node.exprs.forEach((child, idx) => reduceRuleNodeInner(child, maxDepth, depth+1, globalState, node.exprs, idx, lezerGrammar))
    },
    SequenceExpression(node, depth, parent, key, lezerGrammar) {
      if (depth > maxDepth) return
      node.exprs.forEach((child, idx) => reduceRuleNodeInner(child, maxDepth, depth+1, globalState, node.exprs, idx, lezerGrammar))
      if (node.exprs.every(child => terminalNames.has(child.constructor.name))) {
        // all child nodes have been reduced
        parent[key] = new ReducedExprWrapper(node)
        globalState.reduced = true
      }
    },
    RepeatExpression(node, depth, parent, key, lezerGrammar) {
      //const randomMax = 3 // 5 is too much?
      if (depth > maxDepth) return
      // node.kind: * or + or ?
      // random length:
      const min = (node.kind == "+") ? 1 : 0
      const max = (node.kind == "?") ? 1 : (1 + Math.round(Math.random() * randomMax))
      const length = Math.round(min + Math.random() * (max - min))
      /*
      // minimal length:
      // problem: result is too short, can be empty
      const min = (node.kind == "+") ? 1 : 0
      const length = min
      */
      const exprs = Array.from({length}).map(() => node.expr)
      class SequenceExpression {}
      const node2 = new SequenceExpression()
      for (const key in node) {
        node2[key] = node[key]
      }
      delete node2.expr
      delete node2.kind
      node2.exprs = exprs
      //console.log(`RepeatExpression:`, node)
      //console.log(`RepeatExpression replaced with SequenceExpression:`, node2)
      parent[key] = node2
      globalState.reduced = true
    },
    NameExpression(node, depth, parent, key, lezerGrammar) {
      if (depth > maxDepth) return
      // expand
      // resolve name to node
      const name = node.id.name
      const rule = lezerGrammar.rules.find(rule => rule.id.name == name)
      if (rule) {
        //console.log(`resolved name ${name} to rule:`); console.log(rule)
        // TODO deep copy?
        //node.rule = rule
        parent[key] = rule
        //console.log(`reduceRuleNodeInner ${maxDepth}: NameExpression: replaced node`, node); console.log(`.. with rule`, rule)
        globalState.reduced = true
        reduceRuleNodeInner(rule, maxDepth, depth+1, globalState, parent, key, lezerGrammar)
      }
      else {
        // TODO? tokens.literals
        // TODO? tokens.precedences
        // TODO? tokens.conflicts
        //console.log("lezerGrammar.tokens:"); console.dir(lezerGrammar.tokens, {depth: null})
        const token = lezerGrammar.tokens.rules.find(token => token.id.name == name)
        if (token) {
          //console.log(`resolved name ${name} to token:`); console.log(token)
          //node.token = token
          //parent[key] = token
          // no. token can be a non-terminal "token rule" (no?)
          parent[key] = new TokenWrapper(token, token.start)
          // TODO why not?
          //parent[key] = token
          //console.log(`reduceRuleNodeInner ${maxDepth}: NameExpression: replaced node`, node); console.log(`... with`, parent[key])
          globalState.reduced = true
        }
        else {
          console.log(`lezerGrammar.rules:`, lezerGrammar.rules.map(rule => rule.id.name).join(" "))
          console.log(`lezerGrammar.tokens:`, lezerGrammar.tokens.rules.map(rule => rule.id.name).join(" "))
          throw new Error(`not found rule or token by name ${name}`)
        }
      }
    },
    SetExpression() {
      // regex character-class, example: [a-z]
      return // noop. node is terminal
    },
    LiteralExpression() {
      return // noop. node is terminal
    },
    TokenWrapper() {
      return // noop. node is terminal
    },
    ReducedExprWrapper() {
      return // noop. node is terminal
    },
  }
  const handler = reduceRuleNodeHandlers[node.constructor.name] || todoReduceRuleNodeHandler
  handler(node, depth, parent, key, lezerGrammar)
}

function reduceRuleNode(ruleNode, lezerGrammar) {
  console.log(`reduceRuleNode: ruleNode:`, ruleNode)
  //console.log("raw rule tree log:"); console.log(ruleNode)
  // FIXME call stack size exceeded
  // -> avoid function calls: handler functions -> switch block
  // -> avoid recursion -> manual stack management?
  //console.log("raw rule tree fmt:"); formatRuleNode(ruleNode, process.stdout)
  const resultParent = []
  // make a deep copy of the orignal ruleNode,
  // so we can retry if reduceRuleNodeInner does not terminate
  const ruleNodeOriginal = lodash.cloneDeep(ruleNode)
  // retry loop
  let maxDepth = 1
  for (maxDepth = 1; maxDepth < 100; maxDepth++) {
    //console.log(`reduceRuleNode: maxDepth = ${maxDepth}`)
    const globalState = {
      reduced: false,
    }
    console.log(`reduceRuleNode: maxDepth = ${maxDepth}: reduceRuleNodeInner( ruleNode:`, ruleNode)
    reduceRuleNodeInner(ruleNode, maxDepth, 0, globalState, resultParent, 0, lezerGrammar)
    if (resultParent[0]) {
      const result = resultParent[0]
      //console.log(`reduced tree in ${maxDepth} steps`)
      // debug
      //console.log("reduced rule tree:"); formatRuleNode(ruleNode, process.stdout)
      return result
    }
    //console.log(`reduceRuleNode ${maxDepth}: globalState.reduced = ${globalState.reduced}`)
    // reset ruleNode and retry
    ruleNode = ruleNodeOriginal
  }
  console.log(`reduceRuleNode: warning: reached maxDepth = ${maxDepth}`)
  function formatRuleNode(node, writer, depth = 0, maxDepth = 100) {
    // note: cannot return full result because "RangeError: Invalid string length"
    if (depth > maxDepth) {
      writer.write(" ".repeat(depth) + "...\n")
    }
    if (!node) {
      throw new Error("node is empty")
    }
    if (!node.constructor) {
      console.log("formatRuleNode node:", node)
      throw new Error("node.constructor is empty")
    }
    const name = node.constructor.name
    let result = " ".repeat(depth) + `${name} ${node.start}\n`
    if (node.expr) {
      writer.write(result)
      formatRuleNode(node.expr, writer, depth+1, maxDepth)
      return
    }
    if (node.exprs) {
      writer.write(result)
      for (const expr of node.exprs) {
        formatRuleNode(expr, writer, depth+1, maxDepth)
      }
      return
    }
    writer.write(result)
  }
  // FIXME
  console.log(`reduceRuleNode: ruleNode:`)
  formatRuleNode(ruleNode, process.stdout)
  throw new Error(`not reduced rule tree`)
  //console.log(`ruleNode 2:`); console.dir(ruleNode, {depth: null})
}



// FIXME RangeError: Maximum call stack size exceeded

// random token generator
// TODO linear token generator: 1, 2, 3, ... a, b, c, ...
function generateToken(node, lezerGrammar) {
  //console.log(`generateToken: node:`, node)
  console.log(`generateToken: node ${node.constructor.name} ${node.start} ${node.id?.name || node.kind || node.value || ""}`)
  const generateTokenHandlers = {
    TokenWrapper(node) {
      //return generateToken(node.token, lezerGrammar)
      // add whitespace around token
      return " " + generateToken(node.token, lezerGrammar) + " "
    },
    ReducedExprWrapper(node, lezerGrammar) {
      return generateToken(node.expr, lezerGrammar)
    },
    RuleDeclaration(node, lezerGrammar) {
      return generateToken(node.expr, lezerGrammar)
    },
    RepeatExpression(node, lezerGrammar) {
      //return function evalRepeatExpression() {
        let length = 0
        if (node.kind == "*") {
          length = Math.round(Math.random() * randomMax) // random
          //length = 0 // minimal
        }
        else if (node.kind == "+") {
          length = 1 + Math.round(Math.random() * randomMax) // random
          //length = 1 // minimal. TODO avoid collisions?
        }
        else if (node.kind == "?") {
          length = Math.round(Math.random()) // random
          //length = 0 // minimal. TODO avoid collisions?
        }
        else {
          throw new Error(`not implemented: RepeatExpression#kind: ${node.kind}`)
        }
        return Array.from({length}).map(() => generateToken(node.expr, lezerGrammar)).join("")
      //}
    },
    ChoiceExpression(node, lezerGrammar) {
      //return function evalChoiceExpression() {
        const randomMax = node.exprs.length - 1
        const idx = Math.round(Math.random() * randomMax)
        return generateToken(node.exprs[idx], lezerGrammar)
      //}
    },
    SequenceExpression(node, lezerGrammar) {
      return node.exprs.map(child => generateToken(child, lezerGrammar)).join("")
    },
    SetExpression(node, lezerGrammar) {
      let ranges = node.ranges
      if (node.inverted) {
        ranges = []
        if (node.ranges[0][0] != 0) {
          ranges.push([0, node.ranges[0][0] - 1])
        }
        for (let i = 0; i < node.ranges.length; i++) {
          if (node.ranges[i + 1]) {
            ranges.push([node.ranges[i][1] + 1], node.ranges[i + 1][0] - 1)
          }
          else if (node.ranges[i][1] < 255) {
            // last range
            ranges.push([node.ranges[i][1] + 1], 255)
          }
        }
        console.log(`inverted ranges from`, node.ranges, `to`, ranges)
        //throw new Error(`not implemented: SetExpression#inverted: ${node.inverted}`)
      }
      const rangeIdx = Math.round(Math.random() * (ranges.length - 1))
      const range = ranges[rangeIdx]
      // lower bound is inclusive -> range[0]
      // upper bound is exclusive -> range[1] - 1
      const result = range[0] + Math.round(Math.random() * ((range[1] - 1) - range[0]))
      const char = String.fromCharCode(result)
      //console.log(`SetExpression: range [${range[0]}, ${range[1]}] -> ${result} = ${char}`)
      return char
    },
    LiteralExpression(node, lezerGrammar) {
      // TODO?
      // add whitespace around literal
      //return " " + node.value + " "
      return node.value
    },
    NameExpression(node, lezerGrammar) {
      // resolve name to node
      const name = node.id.name
      const rule = lezerGrammar.rules.find(rule => rule.id.name == name)
      if (rule) {
        return generateToken(rule, lezerGrammar)
      }
      else {
        // TODO? tokens.literals
        // TODO? tokens.precedences
        // TODO? tokens.conflicts
        //console.log("lezerGrammar.tokens:"); console.dir(lezerGrammar.tokens, {depth: null})
        const token = lezerGrammar.tokens.rules.find(token => token.id.name == name)
        if (token) {
          //return generateToken(token, lezerGrammar)
          // add whitespace around token
          return " " + generateToken(token, lezerGrammar) + " "
        }
        else {
          console.log(`lezerGrammar.rules:`, lezerGrammar.rules.map(rule => rule.id.name).join(" "))
          console.log(`lezerGrammar.tokens:`, lezerGrammar.tokens.rules.map(rule => rule.id.name).join(" "))
          throw new Error(`not found rule or token by name ${name}`)
        }
      }
    },
  }
  function todoHandler(node, lezerGrammar) {
    console.log(`TODO: add to generateTokenHandlers:
      ${node.constructor.name}(node) {
        return todo
      },
    `)
    console.log("node:")
    console.dir(node)
    throw new Error(`not implemented: node name: ${node.constructor.name}`)
  }
  const handler = generateTokenHandlers[node.constructor.name] || todoHandler
  return handler(node, lezerGrammar)
}

function getRuleFuzzer(ruleText, lezerGrammar) {
  console.log(`getRuleFuzzer: ruleText`, ruleText)
  //console.log(`getRuleFuzzer: lezerGrammar.rules:`, lezerGrammar.rules.map(rule => rule.id.name).join(" "))
  //console.log(`getRuleFuzzer: lezerGrammar.tokens:`, lezerGrammar.tokens.rules.map(rule => rule.id.name).join(" "))

  const [_, name, quantifier] = ruleText.match(/^([a-zA-Z0-9_]+)([+*?]?)/)

  console.log(`getRuleFuzzer: name`, name)
  console.log(`getRuleFuzzer: quantifier`, quantifier)

  assert(quantifier == "" || quantifier == "+")

  let ruleNode = lezerGrammar.rules.find(rule => rule.id.name == name)

  if (!ruleNode) {
    ruleNode = lezerGrammar.tokens.rules.find(rule => rule.id.name == name)
  }

  console.log(`getRuleFuzzer: ruleNode`, ruleNode)
  assert(ruleNode, "getRuleFuzzer: not found ruleNode")

  // ignore quantifier "+" -> minimal result
  /*
  if (quantifier) {
    // wrap ruleNode in RepeatExpression
    class RepeatExpression {}
    const expr = new RepeatExpression()
    expr.start = ruleNode.start
    expr.expr = ruleNode
    expr.kind = quantifier
    ruleNode = expr
    //console.log(`getRuleFuzzer: wrapped ruleNode in RepeatExpression:`, ruleNode)
  }
  */

  //console.log(`getRuleFuzzer: ruleNode`, ruleNode)
  const ruleNodeReduced = reduceRuleNode(ruleNode, lezerGrammar)
  //console.log(`getRuleFuzzer: ruleNodeReduced`, ruleNodeReduced)
  //console.log("ruleNodeReduced:"); console.dir(ruleNodeReduced, {depth: null})
  return function ruleFuzzer() {
    return generateToken(ruleNodeReduced, lezerGrammar)
  }

  const thunk = generateToken(ruleNodeReduced, lezerGrammar)
  console.log(`generateToken: thunk:`, thunk)
  //let step = 1
  return function ruleFuzzer() {
    while (true) {
      //console.log(`ruleFuzzer: step ${step}`)
      let result = thunk
      console.log(`generateToken: result:`, thunk)
      while (typeof result == "function") {
        result = result()
        console.log(`generateToken: result() ->`, thunk)
      }
      /*
      // no, this is too strict, some fuzzers will not terminate (deadloop)
      if (oldTokens.has(result)) {
        // duplicate token -> retry
        continue
      }
      // unique token
      oldTokens.add(result)
      */
      return result
    }
  }
}

function getOriginSample(node, lezerGrammar) {
  // FIXME add whitespace around keywords like "friend" in cpp grammar (friend class)
  console.log(`getOriginSample: node`, node)
  if (node.children.length == 0) {
    // terminal node
    if (node.name.startsWith('"') && node.name.endsWith('"')) {
      return JSON.parse(node.name)
    }

    // FIXME node.name: parse quantifiers like "virtualSpecifier+" -> rule name is "virtualSpecifier"

    // named terminal node
    // TODO resolve: expr -> INT -> [0-9]+ -> 0, 1, 2, 3, ...
    /*
      TODO
      parse grammar.lezer
      find the rule "expr"
      reduce the rule to the simplest variant -> INT
    */
    //console.log(lezerGrammar.rules[0].id.name)
    console.log(`getOriginSample: getRuleFuzzer( node:`, node)
    const ruleFuzzer = getRuleFuzzer(node.name, lezerGrammar)
    //console.log("ruleFuzzer:"); console.dir(ruleFuzzer, {depth: null})
    // FIXME this takes too long (deadloop)
    //console.log(`getOriginSample: ruleFuzzer ...`)
    /*
    for (let i = 0; i < 100; i++) {
      const ruleFuzzer = getRuleFuzzer(node.name, lezerGrammar)
      console.log(`ruleFuzzer() try ${i} ->`, ruleFuzzer())
    }
    */
    return ruleFuzzer()
  }
  else {
    // non-terminal node -> recursion
    return node.children.map(child => getOriginSample(child, lezerGrammar)).join("")
  }
}

}



function applySolution(conflict, solution, grammarMagicString, lezerGrammar) {
  let precName
  if (
    lezerGrammar.precedences == null ||
    lezerGrammar.precedences.items.length == 0
  ) {
    // create new precedence block
    precName = "prec1"
    const attr = (
      solution.isLeft ? " @left" :
      solution.isRight ? " @right" :
      solution.isCut ? " @cut" : // TODO verify
      // https://lezer.codemirror.net/docs/guide/#precedence
      // > It is also possible,
      // > instead of specifying an associativity for a given precedence,
      // > to make it a cut operator by using the keyword @cut.
      // > A cut operator will override other interpretations
      // > even though no conflict was detected yet.
      // @precedence { e1 @cut }
      // @top Program { e+ }
      // e { e1 | e2 }
      // e1 { !e1 "x" ... }
      // e2 { "x" ... }
      // -> solve ambiguity of the keyword "x"
      // example: statement { FunctionDeclaration | FunctionExpression }
      ""
    )
    grammarMagicString.prependLeft(0, [
      "@precedence {",
      `  ${precName}${attr}`,
      "}",
      "",
    ].map(line => line + "\n").join(""))
  }
  else {
    // append to old precedence block
    const oldPrecNames = new Set(lezerGrammar.precedences.items.map(p => p.id.name))
    let precNumber = 1
    function newPrecName() {
      let name
      while (true) {
        name = `prec${precNumber}`
        if (!oldPrecNames.has(name)) {
          // found new name
          oldPrecNames.add(name)
          break
        }
        precNumber++
      }
      return name
    }
    precName = newPrecName()
    const lastPrecDeclaration = lezerGrammar.precedences.items.slice(-1)[0]
    //console.log("lastPrecDeclaration:", lastPrecDeclaration.constructor.name); console.dir(lastPrecDeclaration)
    //console.log("lezerGrammar.precedences:"); console.dir(lezerGrammar.precedences)
    // lezer-generator.js -> function parsePrecedence
    // TODO what is "@cut"? seen in "function parsePrecedence"
    const attr = (
      solution.isLeft ? " @left" :
      solution.isRight ? " @right" :
      solution.isCut ? " @cut" : // TODO verify
      ""
    )
    grammarMagicString.appendRight(lastPrecDeclaration.to, (
      `, ${precName}${attr}\n`
    ))
  }

  // TODO find the conflict position "·" in lezer grammar
  // -> use conflict.term.start
  if (conflict.term.start == -1) {
    throw new Error("FIXME conflict.term.start == -1")
  }
  console.log(`applySolution: adding precedence marker !${precName} at position ${conflict.term.start}`)
  grammarMagicString.prependLeft(conflict.term.start, `!${precName} `)
}
