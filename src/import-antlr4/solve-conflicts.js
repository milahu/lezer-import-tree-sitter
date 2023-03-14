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

*/

import fs from "fs"
import path from "path"
import child_process from "child_process"

import * as antlrFormat from "./format.js"

import antlr4 from 'antlr4';

// TODO feature request to https://github.com/lezer-parser/lezer/issues
// export "class Input", maybe rename to GrammarInput
// and/or export "function parseGrammar" with type: (text: string, name: string) => AST
import { buildParser, Input as LezerGrammarInput } from "../lezer-generator.js"
//import { assert } from "console"
import MagicString from "magic-string";

import { formatErrorContext } from "../format-error-context.js"

// global state
const oldTokens = new Set()
const randomMax = 5 // lower value -> higher risk of collisions and deadloops
// TODO linear token generator -> no deadloops

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

const lezerGrammar = (() => {
  try {
    return new LezerGrammarInput(lezerGrammarText, "grammar.lezer").parse()
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
        console.log("-".repeat(20))
        console.log(contextLines.join("\n"))
        console.log(" ".repeat(+column) + "^")
        console.log("-".repeat(20))
      }
    }
    throw error
  }
})()
//console.log("lezerGrammar:"); console.dir(lezerGrammar, {depth: 10}); return



let lezerParser = null
let lezerGeneratorError = null
try {
  lezerParser = buildParser(lezerGrammarText)
  console.log("no conflicts -> done")
  break // stop: loop grammar generations
}
catch (error) {
  if (
    error.constructor?.name != "GenError" ||
    !error.conflicts
  ) {
    throw error
  }
  lezerGeneratorError = error
  // error.conflicts[0].error
  // error.conflicts[0].rules
  // error.conflicts[0].term // TODO term.start is conflict location in grammar text
}

//console.log("lezerGeneratorError:"); console.log(lezerGeneratorError)
//console.log("lezerGeneratorError.message:"); console.log(lezerGeneratorError.message)



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

function assert(condition, message) {
  if (!condition) {
    if (typeof message == "function") {
      message = message()
    }
    if (message) {
      console.error(message)
    }
    const error = new Error("assertion error")
    const lines = error.stack.split("\n")
    // remove line 2, so first stack frame is call to assert
    lines.splice(1, 1)
    error.stack = lines.join("\n")
    throw error
  }
}



// loop conflicts
let doneFirstConflict = false
for (const conflict of lezerGeneratorError.conflicts) {

  if (doneFirstConflict) console.log("---")

  conflict.inputTokens = conflict.input.split(" ")
  //console.log(`conflict.inputTokens:`, conflict.inputTokens)
  // "·" = conflict position between 2 tokens,
  // usually left of the "problematic" token

  //console.log(`conflict.solutions:`, conflict.solutions); return

  // TODO use raw data from lezerGeneratorError.conflicts
  // convert to string for compatibility with old code
  conflict.solutions = conflict.solutions.map(solution => String(solution))

  conflict.solutions = conflict.solutions.map((text, idx) => {
    const op = conflict.ops[idx]
    const tokens = text.split(" ")
    const source = tokens.shift()
    assert(tokens.shift() == "->")
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
      assert(tokens[1] == "·")
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
      resultText,
    }
  })
  //console.log(`conflict.solutions:`, conflict.solutions)

  conflict.originLines = conflict.origin.split("\n")

  conflict.originTree = createNode("@top")

  let node = conflict.originTree

  for (const originLine of conflict.originLines) {
    //console.log(`originLine: ${originLine}`)
    const [_, lineIndent, lineRest] = originLine.match(/^( *)(.*)$/)
    //console.log(`lineRest: ${lineRest}`)
    const lineTokens = lineRest.split(" ")
    //console.log(`lineTokens:`, lineTokens)
    if (lineTokens[0] != "@top" || lineTokens[0] != "via") {
      //continue
    }
    if (lineTokens[0] == "via") lineTokens.shift() // TODO what is "via"?
    const left = lineTokens.shift()
    const expectArrow = lineTokens.shift()
    if (expectArrow != "->") {
      throw new Error(`assertion error: expected "->", got ${expectArrow} in originLine: ${originLine}`)
    }
    let nextParentIdx = -1
    for (const token of lineTokens) {
      if (token == "·") {
        // next token is next parent
        nextParentIdx = node.children.length
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
  }

  // note: this tree is derived only from conflict.origin
  // but source of truth is conflict.inputTokens

  // note: wrong tree. some nodes have wrong associativity
  // -> source of truth is conflict.inputTokens
  //console.log("conflict.originTree:"); console.dir(conflict.originTree, {depth: null})

  conflict.originSample = getOriginSample(conflict.originTree, lezerGrammar)

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

  const antlrBasePath = path.resolve(process.cwd(), process.argv[3]).replace(/\.g4$/, "")
  //console.log(`antlrBasePath:`, antlrBasePath)

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

  const antlrParser = getANTLRParser(conflict.originSample)
  antlrParser.buildParseTrees = true
  // FIXME dynamic
  const topRule = "expr"
  const tree = antlrParser[topRule]()

  const state = { source: conflict.originSample }
  //console.log("antlr tree:"); antlrFormat.printNode(tree, state)

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

  const antlrResultText = formatAntlrNode(tree)

  console.log(`input:`, conflict.inputTokens.join(" "))
  console.log("solution 1:", conflict.solutions[0].resultText)
  console.log("expected  :", antlrResultText)
  console.log("solution 2:", conflict.solutions[1].resultText)

  let solution = conflict.solutions.find(solution => (
    solution.resultText != null &&
    solution.resultText.toLowerCase().slice(0, antlrResultText.length) == antlrResultText.toLowerCase()
  ))
  if (!solution) {
    solution = conflict.solutions.find(solution => solution.resultText == null)
  }
  if (!solution) {
    console.log(`error: no solution was found`)
    console.log("conflict"); console.dir(conflict, {depth: null})
    return 1
  }

  const solutionIdx = conflict.solutions.indexOf(solution)
  console.log(`using solution ${solutionIdx + 1}`)
  //console.log("solution:", solution)



  // add precedence marker to lezer grammar
  //console.log("lezerGrammar:"); console.log(lezerGrammar)

  let precName
  if (
    lezerGrammar.precedences == null ||
    lezerGrammar.precedences.items.length == 0
  ) {
    // create new precedence block
    precName = "prec1"
    grammarMagicString.prependLeft(0, [
      "@precedence {",
      `  ${precName} ${solution.isLeft ? "@left" : "@right"}`,
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
    grammarMagicString.appendRight(lastPrecDeclaration.to, (
      `, ${precName} ${solution.isLeft ? "@left" : "@right"}\n`
    ))
  }

  // TODO find the conflict position "·" in lezer grammar
  // -> use conflict.term.start
  grammarMagicString.prependLeft(conflict.term.start, `!${precName} `)

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
function reduceRuleNodeInner(node, depth, parent, key, lezerGrammar) {
  const terminalNames = new Set(["TokenWrapper"])
  const reduceRuleNodeHandlers = {
    RuleDeclaration(node, depth, parent, key) { // root node
      if (depth < 0) return
      const child = node.expr
      if (terminalNames.has(child.constructor.name)) {
        parent[key] = child
        return
      }
      reduceRuleNodeInner(child, depth-1, node, "expr", lezerGrammar)
    },
    ChoiceExpression(node, depth, parent, key) {
      if (depth < 0) return
      //console.log("ChoiceExpression: node.exprs:"); console.log(node.exprs)
      const firstTerminal = node.exprs.find(child => terminalNames.has(child.constructor.name))
      if (firstTerminal) {
        // reduce
        parent[key] = firstTerminal
        return
      }
      node.exprs.forEach((child, idx) => reduceRuleNodeInner(child, depth-1, node.exprs, idx, lezerGrammar))
    },
    SequenceExpression(node, depth, parent, key) {
      if (depth < 0) return
      node.exprs.forEach((child, idx) => reduceRuleNodeInner(child, depth-1, node.exprs, idx, lezerGrammar))
    },
    NameExpression(node, depth, parent, key) {
      if (depth < 0) return
      // expand
      // resolve name to node
      const name = node.id.name
      const rule = lezerGrammar.rules.find(rule => rule.id.name == name)
      if (rule) {
        //console.log(`resolved name ${name} to rule:`); console.log(rule)
        // TODO deep copy?
        //node.rule = rule
        parent[key] = rule
        reduceRuleNodeInner(rule, depth-1, parent, key, lezerGrammar)
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
          class TokenWrapper {
            constructor(token) {
              this.token = token
            }
          }
          //parent[key] = token
          parent[key] = new TokenWrapper(token)
        }
        else {
          console.log(`lezerGrammar.rules:`)
          console.dir(lezerGrammar.rules, {depth: null})
          console.log(`lezerGrammar.tokens:`)
          console.dir(lezerGrammar.tokens, {depth: null})
          throw new Error(`not found rule or token by name ${name}`)
        }
      }
    },
    LiteralExpression(node, depth, parent, key) {
      return // noop. node is terminal
    },
    TokenWrapper() {
      return // noop. node is terminal
    },
  }
  const handler = reduceRuleNodeHandlers[node.constructor.name] || todoReduceRuleNodeHandler
  handler(node, depth, parent, key)
}

function reduceRuleNode(ruleNode, lezerGrammar) {
  const resultParent = []
  // TODO more depth?
  for (let depth = 1; depth < 1000; depth++) {
    reduceRuleNodeInner(ruleNode, depth, resultParent, 0, lezerGrammar)
    if (resultParent[0]) {
      const result = resultParent[0]
      //console.log(`reduced tree in ${depth} steps`)
      return result
    }
  }
  throw new Error(`not reduced rule tree`)
  //console.log(`ruleNode 2:`); console.dir(ruleNode, {depth: null})
}

// random token generator
// TODO linear token generator: 1, 2, 3, ... a, b, c, ...
function getTokenGenerator(node) {
  const handlers = {
    TokenWrapper(node) {
      return getTokenGenerator(node.token)
    },
    RuleDeclaration(node) {
      return getTokenGenerator(node.expr)
    },
    RepeatExpression(node) {
      return function evalRepeatExpression() {
        let length = 0
        if (node.kind == "*") {
          length = Math.random() * randomMax // random
          //length = 0 // minimal
        }
        else if (node.kind == "+") {
          length = 1 + (Math.random() * randomMax) // random
          //length = 1 // minimal. TODO avoid collisions?
        }
        else {
          throw new Error(`not implemented: RepeatExpression#kind: ${node.kind}`)
        }
        return Array.from({length}).map(() => getTokenGenerator(node.expr)).join("")
      }
    },
    SetExpression(node) {
      if (node.inverted) {
        throw new Error(`not implemented: SetExpression#inverted: ${node.inverted}`)
      }
      const rangeIdx = Math.round(Math.random() * (node.ranges.length - 1))
      const range = node.ranges[rangeIdx]
      // lower bound is inclusive -> range[0]
      // upper bound is exclusive -> range[1] - 1
      const result = range[0] + Math.round(Math.random() * ((range[1] - 1) - range[0]))
      const char = String.fromCharCode(result)
      //console.log(`SetExpression: range [${range[0]}, ${range[1]}] -> ${result} = ${char}`)
      return char
    },
  }
  function todoHandler(node) {
    console.log(`TODO: add to getTokenGenerator handlers:
      ${node.constructor.name}(node) {
        return todo
      },
    `)
    console.log("node:")
    console.dir(node)
    throw new Error(`not implemented: node name: ${node.constructor.name}`)
  }
  const handler = handlers[node.constructor.name] || todoHandler
  return handler(node)
}

function getRuleFuzzer(name, lezerGrammar) {
  const ruleNode = lezerGrammar.rules.find(rule => rule.id.name == name)
  const ruleNodeReduced = reduceRuleNode(ruleNode, lezerGrammar)
  //console.log("ruleNodeReduced:"); console.dir(ruleNodeReduced, {depth: null})
  const thunk = getTokenGenerator(ruleNodeReduced)
  return function ruleFuzzer() {
    while (true) {
      let result = thunk() // returns result or next thunk
      while (typeof result == "function") {
        result = result()
      }
      if (oldTokens.has(result)) {
        // duplicate token -> retry
        continue
      }
      // unique token
      oldTokens.add(result)
      return result
    }
  }
}

function getOriginSample(node, lezerGrammar) {
  if (node.children.length == 0) {
    // terminal node
    if (node.name.startsWith('"') && node.name.endsWith('"')) {
      return JSON.parse(node.name)
    }
    // named terminal node
    // TODO resolve: expr -> INT -> [0-9]+ -> 0, 1, 2, 3, ...
    /*
      TODO
      parse grammar.lezer
      find the rule "expr"
      reduce the rule to the simplest variant -> INT
    */
    //console.log(lezerGrammar.rules[0].id.name)
    const fuzz = getRuleFuzzer(node.name, lezerGrammar)
    //console.log("fuzz:"); console.dir(fuzz, {depth: null})
    return fuzz()
  }
  else {
    // non-terminal node -> recursion
    // TODO maybe add space between tokens: .join(" ")
    return node.children.map(child => getOriginSample(child, lezerGrammar)).join("")
  }
}

}


