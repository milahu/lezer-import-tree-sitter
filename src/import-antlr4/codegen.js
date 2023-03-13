import {ESLint} from "eslint"
import MagicString from "magic-string"
import lineColumn from 'line-column'
import {format as prettierFormat} from "prettier"
import { addSlashes, removeSlashes } from 'slashes'
import { minify as terserMinify } from 'terser'

// TODO? use code generator from https://github.com/yellicode/typescript-extension

import { firstChild, nextSibling, getParent, nodeText, nodeType, findNode,
  filterNodes, reduceNodes, filterChildNodes } from './query.js'

import { humanFormatNode, printNode, exitNode } from './format.js'

export function commentLines(s, label = "") {
  s = String(s)
  if (label) {
    return s.trim().split("\n").map(line => "/// @" + label + " " + line).join("\n") + "\n"
  }
  return s.trim().split("\n").map(line => "/// " + line).join("\n") + "\n"
}

const tsTypeOfCType = {
  void: "void",
  bool: "boolean",
  int: "number",
  uint32_t: "number",
  int32_t: "number",
  float: "number",
  char: "number",
  wstring: "string", // TODO what is wstring. convert to number[]?
  // TODO more
}

function commentBlock(s, label = "") {
  // using jsdoc comments (/** ... */) as workaround for terser
  // terser removes normal block comments (/* ... */)
  // but with {comments: "all"} config,
  // terser "evaluate" fails to eval x.push(...[y]) to x.push(y)
  if (typeof s != "string") {
    s = JSON.stringify(s, null, 2) // pretty print
  }
  const isMultiLine = s.includes("\n")
  if (isMultiLine) {
    // extra whitespace will be removed by prettier
    s = "\n* " + s.replace(/\n/g, "\n* ") + "\n"
  }
  if (label) {
    return `/** @${label} ${s.replace(/\*\//g, "*\\/")} */`
  }
  return `/** ${s.replace(/\*\//g, "*\\/")} */`
}

/** convert tree-sitter to lezer-parser token name */
export function getTokenName(name, state) {
  //console.error(`getTokenName: tokenName ${name} -> externalName ${externalOfTokenType[name]}`)
  // note: usually scanner.cc and grammar.js use the same names for external tokens,
  // but the names *can* be different.
  // but the names *must* have the same order in both files.
  //console.error("getTokenName: name", JSON.stringify(name))
  const newName = state.externalOfTokenType[name]
  if (!newName) {
    // example: name = "end_type" -> local variable in function scan_heredoc_content
    return name
  }
  // edge case: name = "_simple_heredoc_body" -> filter(Boolean)
  // convert to PascalCase
  return newName.split("_").filter(Boolean).map(part => {
    //console.error("getTokenName: name part", JSON.stringify(part))
    return part[0].toUpperCase() + part.slice(1).toLowerCase()
  }).join("")
}

function unwrapNode(node, state) {
  node = firstChild(node)
  let result = ""
  while (node) {
    //result += `/// @unwrap ${nodeType(node)}\n`
    result += formatNode(node, state)
    node = nextSibling(node)
  }
  return result
}

function ignoreNode(_node, _state) {
  return ""
}

function todoNode(node, state) {
  const nodeStr = humanFormatNode(node, state)
  return "\n" + commentLines(nodeStr, `todo(${nodeType(node)})`)
}

function copyNode(node, state) {
  return nodeText(node, state)
}

/*
function copyNodeLine(node, state) {
  return nodeText(node, state) + "\n"
}
*/

function copyNodeSpace(node, state) {
  return " " + nodeText(node, state) + " "
  //return "\n" + nodeText(node, state) + "\n"
}

function indentBlock(s) {
  const step = "  "
  return step + s.replace(/\n/g, ("\n" + step)).trimEnd()
}



// codegen state
let doneFirstRule = false

const transpileOfNodeType = {
  GrammarSpecContext(node, state) {
    // root node: skip last child: "<EOF>"
    node = firstChild(node)
    let result = ""
    while (node) {
      const chunk = formatNode(node, state)
      node = nextSibling(node)
      if (node) {
        result += chunk
      }
      // else: node was last node
    }
    return result
  },
  ParserRuleSpecContext(node, state) {
    /*
    return todoNode(node, state)
    printNode(node, state)
    throw Error("TODO")
    */
    node = firstChild(node) // ruleName
    const ruleName = nodeText(node, state)
    node = nextSibling(node) // ":"
    node = nextSibling(node)
    const ruleBlockContext = node
    node = nextSibling(node) // ";"
    node = nextSibling(node)
    const exceptionGroupContext = node
    //const nameNode = firstChild(node) // TODO
    if (nodeText(exceptionGroupContext, state) != "") {
      return (
        "// FIXME node with exceptionGroupContext: \n" +
        "// " + JSON.stringify(nodeText(exceptionGroupContext, state)) + "\n" +
        todoNode(node, state)
      )
    }
    // first rule is the top rule
    const rulePrefix = doneFirstRule ? "" : "@top "
    doneFirstRule = true
    const ruleBody = formatNode(ruleBlockContext, state)
    return `${rulePrefix}${ruleName} {\n${indentBlock(ruleBody)}\n}\n\n`
  },
  LexerRuleSpecContext(node, state) {
    /*
    return todoNode(node, state)
    printNode(node, state)
    throw Error("TODO")
    */
    //printNode(node, state, "LexerRuleSpecContext")
    const firstNode = node // LexerRuleSpecContext
    node = firstChild(node) // ruleName or "fragment"
    if (nodeText(node, state) == "fragment") {
      // TODO handle fragment?
      // for now, just print a normal lexer rule
      // maybe rename the rule to `fragment_${ruleName}`
      node = nextSibling(node) // ruleName
    }
    const ruleName = nodeText(node, state)
    node = nextSibling(node) // ":"
    node = nextSibling(node) // LexerRuleBlockContext
    if (nodeText(nextSibling(node), state) != ";") {
      throw new Error(`assertion error: node child-sibling-sibling has no nextSibling ";" in LexerRuleSpecContext:\n${todoNode(firstNode, state)}`)
    }
    node = firstChild(node) // LexerAltListContext
    if (nextSibling(node)) {
      throw new Error(`assertion error: node child-sibling-sibling-child has nextSibling in LexerRuleSpecContext:\n${todoNode(firstNode, state)}`)
    }
    node = firstChild(node) // LexerAltContext
    let ruleBody = ""
    let childIdx = 0
    while (node) {
      if (node.constructor.name == "c") {
        if (nodeText(node, state) != "|") {
          throw new Error(`assertion error: c-node between LexerAltContext is not "|" in LexerRuleSpecContext:\n${todoNode(firstNode, state)}`)
        }
        ruleBody += "|\n"
      }
      else {
        const lec = firstChild(node) // LexerElementsContext
        const lcc = nextSibling(lec) // LexerCommandsContext
        //printNode(node, state, "node")
        //printNode(lec, state, "lec")
        //printNode(lcc, state, "lcc")
        if (nextSibling(lcc)) {
          throw new Error(`assertion error: node lcc ${childIdx} has nextSibling in LexerRuleSpecContext:\n${todoNode(firstNode, state)}`)
        }
        if (lcc) {
          const lccText  = nodeText(lcc, state)
          if (lccText == "->skip") {
            state.skipRules.add(ruleName)
            //ruleBody += commentLines(nodeText(node, state), "skip token")
            ruleBody += formatNode(lec, state)
          }
          else if (lccText == "->channel(HIDDEN)") {
            ruleBody += commentLines(nodeText(node, state), `TODO hidden token`)
            ruleBody += formatNode(lec, state)
          }
          // TODO what is "->channel(HIDDEN)"
          else {
            ruleBody += todoNode(node, state)
          }
        }
        else {
          ruleBody += formatNode(lec, state)
        }
        childIdx++
      }
      node = nextSibling(node) // LexerAltContext
    }
    state.lexerRules.push({
      ruleName,
      ruleBody,
    })
    //return `${ruleName} {\n${indentBlock(ruleBody)}\n}\n\n`
    // defer codegen to formatLexerRules
    // TODO why?
    return ""
  },
  RuleAltListContext(node, state) {
    node = firstChild(node)
    let result = ""
    while (node) {
      const chunk = formatNode(node, state)
      if (chunk == "|") {
        result += "|\n"
      }
      else {
        result += chunk
      }
      node = nextSibling(node)
    }
    return result
  },
  BlockContext(node, state) {
    //return todoNode(node, state)
    // first and last child are parens: (block)
    node = firstChild(node)
    node = nextSibling(node) // "("
    let result = ""
    while (node) {
      const chunk = formatNode(node, state)
      node = nextSibling(node)
      if (node) {
        result += chunk
      }
      // else: node was last node
    }
    return "(\n" + indentBlock(result) + "\n)"
    // trailing space is added in ElementContext
  },
  BlockSetContext(node, state) {
    //return todoNode(node, state)
    // mix of BlockContext "(...)" and RuleAltListContext "a|b|c"
    node = firstChild(node) // "("
    node = nextSibling(node)
    let result = ""
    while (node) {
      const chunk = formatNode(node, state)
      node = nextSibling(node)
      if (node) {
        if (chunk == "|") {
          result += "|\n"
        }
        else {
          result += chunk
        }
      }
      // else: node was last node ")"
    }
    return "(\n" + indentBlock(result) + "\n)"
    // trailing space is added in ElementContext
  },
  TerminalContext(node, state) {
    const result = unwrapNode(node, state)
    if (result == "EOF") {
      // ignore the explicit "EOF" token in the top node
      return ""
    }
    return result
  },
  LexerAtomContext(node, state) {
    const result = unwrapNode(node, state)
    if (result[0] == "[") {
      if (result[result.length - 1] != "]") {
        throw new Error(`expected regex character-class [...] in node:\n${nodeText(node, state)}`)
      }
      // add "$" prefix for lezer
      // https://lezer.codemirror.net/docs/guide/#tokens
      // $[a-z] matches a, z, and any character that ... comes between them.
      // To create an inverted character set, ...
      // you write an exclamation mark rather than a dollar sign before the brackets.
      // So ![x] matches any character that is not x.
      return (
        //"// converted regex character-class:\n" +
        "$" + result
      )
    }
    return result
  },
  ActionBlockContext(node, state) {
    // C code embedded in the grammar -> produce comment
    // this is left-associative = belongs to the previous token
    return "\n" + commentLines(nodeText(node, state), "ActionBlock")
  },
  LabeledElementContext(node, state) {
    // label = element
    node = firstChild(node)
    const label = formatNode(node, state)
    node = nextSibling(node) // "="
    node = nextSibling(node)
    const element = formatNode(node, state)
    // create ad-hoc rule in lezer
    // TODO better? what exactly is the effect of label?
    return `${label} { ${element} }`
  },
  NotSetContext(node, state) {
    //return todoNode(node, state)
    // example: ~(a|b|c)
    // semantics: negation of (a|b|c)
    // -> (NOT a) AND (NOT b) AND (NOT c)
    // https://github.com/antlr/antlr4/blob/8188dc5388dfe9246deb9b6ae507c3693fd55c3f/tool/src/org/antlr/v4/parse/ANTLRParser.g#L758
    // Inverted element set:
    // A set of characters (in a lexer) or terminal tokens (in a parser),
    // that are then used to create the INVERSE set of them.
    // FIXME negating rules does not work in lezer,
    // so we must codegen external scanners.
    // in lezer, we can only negate regex character-classes:
    // ![a-z] = match all chars except a-z
    node = firstChild(node) // "~"
    node = nextSibling(node)
    const body = formatNode(node, state)
    // use "!" to invert. TODO verify
    return (
      "\n" +
      "/// @TODO verify negation\n" +
      `!${body}`
    )
  },
}

// trivial transpilers

//transpileOfNodeType.GrammarSpecContext = unwrapNode // root node

transpileOfNodeType.c = copyNode // chars = anonymous string node

transpileOfNodeType.GrammarDeclContext = ignoreNode // grammar name, TODO use in analyze
transpileOfNodeType.PrequelConstructContext = ignoreNode // example: tokenVocab=CPP14Lexer

transpileOfNodeType.RulesContext = unwrapNode
transpileOfNodeType.RuleSpecContext = unwrapNode
transpileOfNodeType.RuleBlockContext = unwrapNode

//transpileOfNodeType.AltListContext = unwrapNode // a | b | c
//transpileOfNodeType.RuleAltListContext = unwrapNode // a | b | c
//transpileOfNodeType.BlockSetContext = unwrapNode // (a|b|c)
transpileOfNodeType.AltListContext = transpileOfNodeType.RuleAltListContext
//transpileOfNodeType.BlockSetContext = transpileOfNodeType.RuleAltListContext // indent is missing

transpileOfNodeType.LabeledAltContext = unwrapNode // TODO label?
transpileOfNodeType.AlternativeContext = unwrapNode

//transpileOfNodeType.ElementContext = unwrapNode
transpileOfNodeType.ElementContext = (n, s) => unwrapNode(n, s) + " " // add trailing space
transpileOfNodeType.SetElementContext = (n, s) => unwrapNode(n, s) + " " // add trailing space

transpileOfNodeType.AtomContext = unwrapNode
transpileOfNodeType.RulerefContext = unwrapNode

transpileOfNodeType.EbnfContext = unwrapNode // (expr)?
//transpileOfNodeType.EbnfContext = (n, s) => unwrapNode(n, s) + " " // add trailing space
transpileOfNodeType.EbnfSuffixContext = unwrapNode

//transpileOfNodeType.BlockContext = unwrapNode // (expr)
transpileOfNodeType.BlockSuffixContext = unwrapNode

// example: identifier of ActionBlock
transpileOfNodeType.IdentifierContext = unwrapNode

//transpileOfNodeType.LexerRuleBlockContext = unwrapNode
transpileOfNodeType.LexerAltListContext = transpileOfNodeType.RuleAltListContext
transpileOfNodeType.LexerAltContext = unwrapNode // 1 or 2 children: LexerElementsContext [LexerCommandsContext]
transpileOfNodeType.LexerBlockContext = transpileOfNodeType.BlockContext
transpileOfNodeType.LexerElementsContext = unwrapNode
transpileOfNodeType.LexerElementContext = (n, s) => unwrapNode(n, s) + " " // add trailing space
//transpileOfNodeType.LexerAtomContext = unwrapNode // can be regex
//transpileOfNodeType.TerminalContext = unwrapNode

// ignore markers like "<assoc=right>"
// these markers are useless, because they are in the wrong position.
// ANTLR has markers before rules, lezer has markers before tokens.
// conflicts are solved by src/import-antlr4/solve-conflicts.js
transpileOfNodeType.ElementOptionsContext = ignoreNode

/*

transpileOfNodeType.TerminalContext = unwrapNode
*/

/*
*/

/*

//transpileOfNodeType.PreprocDirective = transpileOfNodeType.Todo
transpileOfNodeType.NamespaceDefinition = unwrapNode
transpileOfNodeType.namespace = unwrapNode
//transpileOfNodeType.DeclarationList = transpileOfNodeType.Program
// code block: { ... }
transpileOfNodeType.CompoundStatement = unwrapNode
//transpileOfNodeType.ReturnStatement = unwrapNode
transpileOfNodeType.SwitchStatement = unwrapNode
//transpileOfNodeType.CaseStatement = unwrapNode // no. colon is missing
transpileOfNodeType.ParameterList = unwrapNode

transpileOfNodeType.WhileStatement = unwrapNode
//transpileOfNodeType.ForStatement = unwrapNode // no. semicolons are missing
transpileOfNodeType.ConditionClause = unwrapNode
transpileOfNodeType.IfStatement = unwrapNode
//transpileOfNodeType.BinaryExpression = unwrapNode // no. must handle comparison of strings
//transpileOfNodeType.SubscriptExpression = unwrapNode // no. must handle valid_symbols[X]
transpileOfNodeType.UnaryExpression = unwrapNode
transpileOfNodeType.ArgumentList = unwrapNode
transpileOfNodeType.ParenthesizedExpression = unwrapNode
transpileOfNodeType.TypeDescriptor = unwrapNode // TODO?

transpileOfNodeType.String = copyNode
transpileOfNodeType.EscapeSequence = copyNode // example: \n

transpileOfNodeType.BlockComment = copyNode

transpileOfNodeType[","] = copyNode
transpileOfNodeType["("] = copyNode
transpileOfNodeType[")"] = copyNode
transpileOfNodeType["["] = copyNode
transpileOfNodeType["]"] = copyNode
transpileOfNodeType["{"] = copyNode
transpileOfNodeType["}"] = copyNode

transpileOfNodeType.ArithOp = copyNodeSpace // ex: +
transpileOfNodeType.UpdateOp = copyNodeSpace // ex: +=
transpileOfNodeType.CompareOp = copyNodeSpace // ex: ==
transpileOfNodeType.LogicOp = copyNodeSpace // ex: &&
transpileOfNodeType.True = copyNodeSpace
transpileOfNodeType.False = copyNodeSpace
transpileOfNodeType.Null = copyNodeSpace // TODO verify
transpileOfNodeType.Number = copyNodeSpace
//transpileOfNodeType.Identifier = copyNodeSpace
transpileOfNodeType.BreakStatement = copyNodeSpace

transpileOfNodeType.while = copyNodeSpace
transpileOfNodeType.for = copyNodeSpace
transpileOfNodeType.if = copyNodeSpace
transpileOfNodeType.else = copyNodeSpace
transpileOfNodeType.continue = copyNodeSpace
transpileOfNodeType.break = copyNodeSpace
transpileOfNodeType.return = copyNodeSpace
transpileOfNodeType.switch = copyNodeSpace
transpileOfNodeType.case = copyNodeSpace

*/

/*
transpileOfNodeType.ForStatement = unwrapNode
transpileOfNodeType["for"] = copyNode
*/

const debug = true


export function formatNode(node, state) {
  //return todoNode(node, state) // print full parse tree
  const debug = false
  if (!(nodeType(node) in transpileOfNodeType)) {
    //return `// nodeType=${nodeType(node)} not in transpileOfNodeType\n` + todoNode(node, state)
    return todoNode(node, state)
    //throw new Error("not implemented: nodeType(node) = " + nodeType(node))
  }
  return (
    (debug ? ("\n" + commentLines(nodeText(node, state).split("\n")[0], `source(${nodeType(node)})`)) : "") +
    transpileOfNodeType[nodeType(node)](node, state)
  )
}



function formatLexerRules(state) {
  if (state.lexerTree) {
    // populate state.lexerRules
    formatNode(state.lexerTree, state)
  }
  let result = ""
  for (const {ruleName, ruleBody} of state.lexerRules) {
    result += `${ruleName} {\n${indentBlock(ruleBody)}\n}\n\n`
  }
  if (result != "") {
    result = (
      "@tokens {\n\n" +
      indentBlock(result) +
      "\n}\n\n"
    )
  }
  return result
}



function formatSkipRules(state) {
  if (Array.from(state.skipRules).length == 0) {
    return ""
  }
  const body = Array.from(state.skipRules).join(",\n")
  return `@skip {\n${indentBlock(body)}\n}\n\n`
}



// remove trailing whitespace from every line
// String#trimEnd trims only the last line
// "\s+" would remove empty lines
function trimLinesEnd(s) {
  return s.replace(/[ \t]+$/gm, "")
}



export function getCode(state) {
  state.skipRules = new Set()
  state.lexerRules = []
  return trimLinesEnd(
    formatNode(state.tree, state) +
    formatLexerRules(state) +
    formatSkipRules(state) +
    ""
  ).trimEnd()
}
