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
  return step + s.replace(/\n/g, ("\n" + step))
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
    node = firstChild(node) // "~"
    node = nextSibling(node)
    const body = formatNode(node, state)
    // use "!" to invert. TODO verify
    return (
      "\n" +
      "// TODO verify negation\n" +
      `!${body}`
    )
  },
}

// trivial transpilers

//transpileOfNodeType.GrammarSpecContext = unwrapNode // root node

transpileOfNodeType.c = copyNode // chars = anonymous string node

transpileOfNodeType.GrammarDeclContext = ignoreNode
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
    (debug ? (commentBlock(nodeText(node, state).split("\n")[0], `source(${nodeType(node)})`)) : "") +
    transpileOfNodeType[nodeType(node)](node, state)
  )
}



export function getCode(tree, state) {
  return formatNode(tree, state)
}