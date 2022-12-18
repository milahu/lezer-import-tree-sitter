import {ESLint} from "eslint"
import MagicString from "magic-string"
import lineColumn from 'line-column'
import {format as prettierFormat} from "prettier"
import { addSlashes, removeSlashes } from 'slashes'

// TODO? use code generator from https://github.com/yellicode/typescript-extension

import { firstChild, nextSibling, getParent, nodeText, findNode,
  filterNodes, reduceNodes, filterChildNodes } from './lezer-tree-query.js'
import { humanFormatNode, printNode, exitNode } from './lezer-tree-format.js'

export function commentLines(s, label = "") {
  if (label) {
    return s.trim().split("\n").map(line => "/// @" + label + " " + line).join("\n") + "\n"
  }
  return s.trim().split("\n").map(line => "/// " + line).join("\n") + "\n"
}

function commentBlock(s, label = "") {
  if (typeof s != "string") {
    s = JSON.stringify(s, null, 2) // pretty print
  }
  const isMultiLine = s.includes("\n")
  if (isMultiLine) {
    // extra whitespace will be removed by prettier
    s = "\n* " + s.replace(/\n/g, "\n* ") + "\n"
  }
  if (label) {
    return `/* @${label} ${s.replace(/\*\//g, "*\\/")} */`
  }
  return `/* ${s.replace(/\*\//g, "*\\/")} */`
}

/** convert tree-sitter to lezer-parser token name */
export function getTokenName(name, state) {
  //console.error(`getTokenName: tokenName ${name} -> externalName ${externalOfTokenType[name]}`)
  // note: usually scanner.cc and grammar.js use the same names for external tokens,
  // but the names *can* be different.
  // but the names *must* have the same order in both files.
  //console.error("getTokenName: name", JSON.stringify(name))
  name = state.externalOfTokenType[name]
  // edge case: name = "_simple_heredoc_body" -> filter(Boolean)
  // convert to PascalCase
  return name.split("_").filter(Boolean).map(part => {
    //console.error("getTokenName: name part", JSON.stringify(part))
    return part[0].toUpperCase() + part.slice(1).toLowerCase()
  }).join("")
}

const transpileOfNodeType = {
  PreprocDirective(node, state) {
    // example: #include <tree_sitter/parser.h>
    const text = nodeText(node, state)
    return commentLines(text, "preproc")
  },
  ExpressionStatement(node, state) {
    node = firstChild(node)
    return node.type.format(node, state) + ";\n"
  },
  UpdateExpression(node, state) {
    // example: i++
    return unwrapNode(node, state)
  },
  LineComment(node, state) {
    return nodeText(node, state) + "\n"
  },
  FieldExpression(node, state) {
    const fullNode = node
    const text = nodeText(node, state)
    if (text == "lexer->lookahead") {
      //return "input.next"
      // workaround for https://github.com/microsoft/TypeScript/issues/9998
      return "inputNext()"
    }
    node = firstChild(node) // object
    const name = nodeText(node, state)
    node = nextSibling(node) // key1
    let keys = [nodeText(node, state)]
    node = nextSibling(node) // key2?
    while (node) {
      keys.push(nodeText(node, state))
      node = nextSibling(node)
    }
    // translate keys
    const keysMap = {
      size: "length",
    }
    keys = keys.map(key => (key in keysMap) ? keysMap[key] : key)
    return (
      //"\n" + humanFormatNode(node, state, "/// @todo(FieldExpression) " + JSON.stringify(text)) +
      //"\n" + humanFormatNode(fullNode, state, "/// @todo(FieldExpression) " + JSON.stringify(text)) +
      //"\n" + commentLines("@todo(FieldExpression) " + JSON.stringify(text)) +
      "\n" +
      name + "." + keys.join(".")
    )
  },
  CallExpression(node, state) {
    // TODO
    const fullNode = node
    const text = nodeText(node, state)
    const funcNameMap = {
      //"lexer->advance": "todo", // no. we also must transpile the arguments
    }
    node = firstChild(node)
    // function
    const nameNode = node
    let name = nodeText(node, state)
    if (node.type.name == "FieldExpression") {
      // based on FieldExpression(node, state)
      let node = firstChild(nameNode) // object
      const name = nodeText(node, state)
      node = nextSibling(node) // key1
      let keys = [nodeText(node, state)]
      node = nextSibling(node) // key2?
      while (node) {
        keys.push(nodeText(node, state))
        node = nextSibling(node)
      }
      if (state.convertStringToArrayNames.has(name)) {
        // convert string to array
        //printNode(fullNode, state); console.dir({keys}); process.exit()
        if (keys.length == 1) {
          if (keys[0] == "empty") {
            // someString.empty() -> (someArray.length == 0)
            return `(${name}.length == 0)`
          }
        }
        // TODO more
        printNode(fullNode, state); console.dir({keys}); process.exit()
      }
      if (keys.slice(-1)[0] == "size") {
        // x.size() -> x.length
        // translate keys
        const keysMap = {
          size: "length",
        }
        keys = keys.map(key => (key in keysMap) ? keysMap[key] : key)
        // debug
        if (
          name != "delimiter" &&
          keys[0] != "advance"
        ) {
          throw new Error("TODO CallExpression to FieldExpression: " + name + "." + keys.join("."))
        }
        return (
          //"\n" + humanFormatNode(fullNode, state, "/// @todo(CallExpression) " + JSON.stringify(text)) +
          //"\n" + commentLines("@todo(FieldExpression) " + JSON.stringify(text)) +
          //"\n" +
          name + "." + keys.join(".")
        )
      }
    }
    /*
    if (name in funcNameMap) {
      name = funcNameMap[name]
    }
    */
    node = nextSibling(node)
    // arguments
    if (name == "lexer->advance") {
      //return `input.advance(${formatNode(node, state)}) // TODO arguments\n`
      // https://tree-sitter.github.io/tree-sitter/creating-parsers
      // void (*advance)(TSLexer *, bool skip)
      // A function for advancing to the next character.
      // If you pass true for the second argument, the current character will be treated as whitespace.
      // https://lezer.codemirror.net/docs/ref/#lr.InputStream
      // 
      // parse arguments
      const args = []
      node = firstChild(node)
      while (node) {
        if (
          node.type.name != "(" &&
          node.type.name != "," &&
          node.type.name != ")"
        ) {
          args.push(nodeText(node, state))
        }
        node = nextSibling(node)
      }
      return (
        //"\n" +
        //todoNode(fullNode, state) + "\n" +
        //commentLines("TODO arguments?\n" + nodeText(fullNode, state)) +
        //commentLines("TODO arguments? " + JSON.stringify(args)) +
        (args[1] == "true" ? commentLines("TODO skip whitespace\noriginal call:\n" + nodeText(fullNode, state)) : "") +
        //(args[1] == "true" ? ("\n" + commentLines("TODO skip whitespace: lexer->advance(lexer, true)")) : "") +
        //`input.advance();\n`
        `input.advance()`
      )
    }
    if (name == "lexer->mark_end") {
      // lexer->mark_end(lexer)
      // https://tree-sitter.github.io/tree-sitter/creating-parsers
      // void (*mark_end)(TSLexer *)
      // A function for marking the end of the recognized token.
      return (
        `/// @todo token name. original call: ${JSON.stringify(nodeText(fullNode, state))}\n` +
        `input.acceptToken(TODO_TOKEN_NAME)`
      )
    }
    return unwrapNode(fullNode, state)
    //return humanFormatNode(fullNode, state, "/// @todo CallExpression")

    /*
    const text = nodeText(node, state)
    if (text == "lexer->advance(lexer, true)") {
      return "TODO"
    }
    */
  },
  TemplateFunction(node, state) {
    const text = nodeText(node, state);
    //if (text == "static_cast<unsigned>") {
    if (text.startsWith("static_cast<")) {
      return ""
      //return unwrapNode(node, state)
    }
    return todoNode(node, state)
    /*
    const fullNode = node
    node = firstChild(node) // Identifier
    const name = nodeText(node, state)
    node = nextSibling(node) // TemplateArgumentList
    const args = nodeText(node, state)
    // TODO ...
    */
  },
  AssignmentExpression(node, state) {
    // TODO
    const fullNode = node
    const funcNameMap = {
      //"lexer->advance": "todo", // no. we also must transpile the arguments
    }
    node = firstChild(node)
    // left node
    let name = nodeText(node, state)
    /*
    if (name in funcNameMap) {
      name = funcNameMap[name]
    }
    */
    // TODO fix lezer-parser-cpp. "=" should be second node
    node = nextSibling(node) // middle or right node
    const middleOrRightNode = node
    node = nextSibling(node) // right node?
    const operatorText = node ? nodeText(middleOrRightNode, state) : "="
    const rightNode = node ? node : middleOrRightNode
    if (name == "lexer->result_symbol") {
      //return `input.advance(${formatNode(node, state)}) // TODO arguments\n`
      const tokenName = getTokenName(nodeText(rightNode, state), state)
      return (
        "\n" +
        //commentLines("TODO arguments?\n" + nodeText(fullNode, state)) +
        `input.acceptToken(${state.tokenNamePrefix}${tokenName})`
      )
    }
    if (state.convertStringToArrayNames.has(name)) {
      // convert string to array
      return (
        `/// converted string to number[]\n` +
        `${name}.push(${formatNode(rightNode, state)})`
      )
    }
    //return unwrapNode(fullNode, state) // wrong, "=" is missing
    //return humanFormatNode(fullNode, state, "/// @todo CallExpression")
    return (
      //todoNode(fullNode, state) + "\n" +
      name +
      operatorText +
      formatNode(rightNode, state)
    )

    /*
    const text = nodeText(node, state)
    if (text == "lexer->advance(lexer, true)") {
      return "TODO"
    }
    */
  },
  _CharLiteral(node, state) {
    const text = nodeText(node, state);
    const char = JSON.parse('"' + (
      text
      .slice(1, -1) // unwrap single quotes
      .replace("\\'", "'") // remove escape
      .replace('"', '\\"') // add escape
    ) + '"')
    // eval char to number
    return (
      char.charCodeAt(0) +
      //` // ${text}.charCodeAt(0)\n`
      ` // ${text}\n`
    )
  },
  CharLiteral(node, state) {
    const text = nodeText(node, state);
    /*
    // this fails at '\\0' -> SyntaxError: Bad escaped character in JSON
    const char = JSON.parse('"' + (
      text
      .slice(1, -1) // unwrap single quotes
      .replace("\\'", "'") // remove escape
      .replace('"', '\\"') // add escape
    ) + '"')
    */
    const char = removeSlashes(text.slice(1, -1))
    // eval char to number
    const code = char.charCodeAt(0)
    const name = state.asciiNames[code]
    state.usedAsciiCodes.add(code)
    return name
  },
  ReturnStatement(node, state) {
    // TODO?
    const fullNode = node
    return (
      //"\n" +
      commentLines("TODO return?") +
      unwrapNode(fullNode, state) +
      //";\n"
      ";"
    )
  },
  Declaration(node, state) {
    // TODO?
    const fullNode = node
    //console.error("fullNode", humanFormatNode(fullNode, state))
    node = firstChild(node)
    let type = nodeText(node, state)
    node = nextSibling(node)
    // TODO refactor branches
    let name = "";
    let value = "";
    if (node.type.name == "InitDeclarator") {
      /*
        // type + name + value
        Declaration: "int delimiter_index = -1;" // fullNode
          PrimitiveType: "int" // name
          InitDeclarator: "delimiter_index = -1"
            Identifier: "delimiter_index"
            UnaryExpression: "-1"
              ArithOp: "-"
              Number: "1"
      */
      node = firstChild(node)
      name = nodeText(node, state)
      node = nextSibling(node)
      if (node.type.name == "InitializerList") {
        /*
          example:
          Declaration: "State state = {false, 0, 0, 0};"
            TypeIdentifier: "State"
            InitDeclarator: "state = {false, 0, 0, 0}"
              Identifier: "state"
              InitializerList: "{false, 0, 0, 0}"
                {: "{"
                False: "false"
                ...
        */
        // struct fields are declared in StructSpecifier
        node.structType = type;
      }
      value = formatNode(node, state)
    }
    else {
      /*
        // type + name
        Declaration: "wstring delimiter;"
          TypeIdentifier: "wstring"
          Identifier: "delimiter"
      */
      name = nodeText(node, state)
    }

    let tsType;
    const typesMap = {
      int: "number",
      wstring: "string", // TODO what is wstring
      // TODO more
    }
    if (type in typesMap) {
      type = typesMap[type]
    }
    if (type == "string") {
      // quickfix: lezer-parser returns characters as numbers
      // so instead of strings, we usually want Array<number>
      type = "array"
      tsType = "number[]"
      // TODO find next parent scope
      state.convertStringToArrayNames.add(name)
    }

    if (!value) {
      // we must set init value, otherwise ...
      // let s; s += 'x'; s == 'undefinedx'
      // let n; n += 1"; n == NaN
      const initValueOfType = {
        string: '""',
        number: '0',
        boolean: 'false',
        array: '[]',
        object: '{}',
      }
      // get init value, or make it explicitly undefined
      value = initValueOfType[type] || "undefined"
    }

    const isConst = ["array", "object"].includes(type)

    return (
      //"\n" +
      //todoNode(fullNode, state) + "\n" +
      `/** @type {${tsType || type}} */\n` +
      `${isConst ? "const" : "let"} ${name}` + " = " + value + ";\n"
    )
  },
  _IfStatement() {},
  ForStatement(node, state) {
    // cannot use unwrapNode because semicolons are missing in the parse tree
    const fullNode = node
    node = firstChild(node) // "for"
    node = nextSibling(node) // "("
    node = nextSibling(node)
    //throw new Error("asdf: " + nodeText(node, state)) // debug
    //throw new Error(node.type.name) // debug
    if (node.type.name == ")") {
      // for (;;) == while (true)
      node = nextSibling(node) // body: { ... }
      return `while (true) ` + formatNode(node, state) + "\n"
    }
    return todoNode(fullNode, state)
  },
  StructSpecifier(node, state) {
    // cannot use unwrapNode because semicolons are missing in the parse tree
    const fullNode = node
    node = firstChild(node) // struct: "struct"
    node = nextSibling(node) // TypeIdentifier: "State"
    const name = nodeText(node, state)
    node = nextSibling(node) // FieldDeclarationList: "{"
    node = firstChild(node) // {: "{"
    const fieldStrings = []
    const fields = []
    while (node) {
      if (node.type.name == "FieldDeclaration") {
        let n = firstChild(node)
        let type = nodeText(n, state)
        // TODO refactor tsType
        const typesMap = {
          uint32_t: "number",
          bool: "boolean",
        };
        if (type in typesMap) {
          type = typesMap[type];
        }
        n = nextSibling(n)
        const key = nodeText(n, state)
        fieldStrings.push(`${key}: ${type};`)
        fields.push({ name: key, type })
      }
      node = nextSibling(node)
    }
    // TODO use local scope
    state.structFields[name] = fields
    return `\n/**\n* @typedef {{\n*   ${fieldStrings.join("\n*   ")}\n* }} ${name}\n*/\n`
  },
  // init value of struct variable.
  // must handle this in Declaration,
  // because we need the struct type
  InitializerList(node, state) {
    if (!node.structType) {
      return (
        `\n/// @fixme InitializerList: node.structType is missing\n` +
        todoNode(node, state)
      )
    }
    /*
      example:
      Declaration: "State state = {false, 0, 0, 0};"
        TypeIdentifier: "State"
        InitDeclarator: "state = {false, 0, 0, 0}"
          Identifier: "state"
          InitializerList: "{false, 0, 0, 0}"
            {: "{"
            False: "false"
            ,: ","
            Number: "0"
            ,: ","
            Number: "0"
            ,: ","
            Number: "0"
            }: "}"
    */
    const fields = state.structFields[node.structType]
    node = firstChild(node) // "{"
    node = nextSibling(node) // value or "}"
    let fieldIdx = 0
    const keyvals = []
    while (node) {
      if (node.type.name != "," && node.type.name != "}") {
        // value
        const { name, type } = fields[fieldIdx]
        keyvals.push(`${name}: ${formatNode(node, state)}`)
        fieldIdx++
      }
      node = nextSibling(node)
    }
    return `{ ${keyvals.join(", ")} }`
  },
  CaseStatement(node, state) {
    //return todoNode(node, state)
    let result = ""
    node = firstChild(node) // "case"
    node = nextSibling(node) // value
    const value = node.type.format(node, state)
    result += `case ${value}:\n`
    // statements ...
    node = nextSibling(node)
    while (node) {
      result += node.type.format(node, state)
      node = nextSibling(node)
    }
    result += "\n"
    return result
  },
  SubscriptExpression(node, state) {
    return (
      todoNode(node, state) +
      unwrapNode(node, state)
    )
  },
}

function unwrapNode(node, state) {
  node = firstChild(node)
  let result = ""
  while (node) {
    //result += `/// @unwrap ${node.type.name}\n`
    result += node.type.format(node, state)
    node = nextSibling(node)
  }
  return result
}

function ignoreNode(_node, _state) {
  return ""
}

function todoNode(node, state) {
  const nodeStr = humanFormatNode(node, state)
  return "\n" + commentLines(nodeStr, `todo(${node.type.name})`)
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
}



// trivial transpilers

transpileOfNodeType.UsingDeclaration = ignoreNode // example: use std::iswspace;

transpileOfNodeType.Program = unwrapNode
//transpileOfNodeType.PreprocDirective = transpileOfNodeType.Todo
transpileOfNodeType.NamespaceDefinition = unwrapNode
transpileOfNodeType.namespace = unwrapNode
//transpileOfNodeType.DeclarationList = transpileOfNodeType.Program
// code block: { ... }
transpileOfNodeType.CompoundStatement = unwrapNode
//transpileOfNodeType.ReturnStatement = unwrapNode
transpileOfNodeType.SwitchStatement = unwrapNode
//transpileOfNodeType.CaseStatement = unwrapNode // no. colon is missing

transpileOfNodeType.WhileStatement = unwrapNode
//transpileOfNodeType.ForStatement = unwrapNode // no. semicolons are missing
transpileOfNodeType.ConditionClause = unwrapNode
transpileOfNodeType.IfStatement = unwrapNode
transpileOfNodeType.BinaryExpression = unwrapNode
//transpileOfNodeType.SubscriptExpression = unwrapNode // no. must handle valid_symbols[X]
transpileOfNodeType.UnaryExpression = unwrapNode
transpileOfNodeType.ArgumentList = unwrapNode
transpileOfNodeType.ParenthesizedExpression = unwrapNode

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
transpileOfNodeType.Identifier = copyNodeSpace
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

/*
transpileOfNodeType.ForStatement = unwrapNode
transpileOfNodeType["for"] = copyNode
*/

const debug = true


export function formatNode(node, state) {
  const debug = false
  if (!(node.type.name in transpileOfNodeType)) {
    return todoNode(node, state)
    //throw new Error("not implemented: node.type.name = " + node.type.name)
  }
  return (
    (debug ? (commentBlock(nodeText(node, state).split("\n")[0], `source(${node.type.name})`)) : "") +
    transpileOfNodeType[node.type.name](node, state)
  )
}



function getFileHeader(state) {

  // TODO get names from grammar -> import.ts
  const newNames = ["Todo", "Todo2"]

  const fileHeader = [
    //`// tokens.js`,
    `// scanner.js - generated from scanner.cc`,
    //`/// TODO translate functions from scanner.c`,
    ``,
    //`const debug = true`,
    //``,
    /*
    `import {`,
    `  ExternalTokenizer,`,
    `  //ContextTracker,`,
    `} from "@lezer/lr"`,
    */
    `import { ExternalTokenizer } from "@lezer/lr"`,
    ``,

    // jsdoc types: not needed, @lezer/lr has typescript types
    //`/**`,
    // TODO import types?
    // https://lezer.codemirror.net/docs/ref/#lr.InputStream
    // /** @typedef {import("@lezer/lr").SomeType} SomeType */
    /*
    // two types: Input + ETF
    `  @typedef {{`,
    `    next: number;`,
    `    pos: number;`,
    `    peek: (offset: number) => number;`,
    `    advance: (count?: number = 1) => number;`,
    `    acceptToken: (type: number, endOffset?: number = 0) => void;`,
    `  }} Input`,
    ``,
    `  @typedef {(input: Input) => any} ETF`, // TODO return type?
    `  external tokenizer function`,
    */
    // one type: ETF
    /*
    `  @typedef {(input: {`,
    `    next: number;`,
    `    peek: (offset: number) => number;`,
    `    advance: (count?: number = 1) => number;`,
    `    acceptToken: (type: number, endOffset?: number = 0) => void;`,
    `  }) => any} ETF`, // TODO return type?
    `  external tokenizer function`,
    */
    //`*/`,
    //``,

    /*
    ...(
      tokenTypeNames
      ? [
        // no. cannot use same names for import + export
        `import {`,
        ...tokenTypeNames.map(name => `  ${getTokenName(name)},`),
        `} from "./parser.terms.js"`,
      ]
      : [
        `import * as ${tokensObjectName} from "./parser.terms.js"`,
      ]
    ),
    */
    `// @ts-ignore Cannot find module - file is generated`,
    `import * as ${state.tokensObjectName} from "./parser.terms.js"`,
    ``,
    ...(
      state.usedAsciiCodes.size > 0
      ? [
        `// ascii chars`,
        (
          "const " +
          Array.from(state.usedAsciiCodes.values()).sort((a, b) => (a - b)).map(code => `${state.asciiNames[code]} = ${code}`).join(", ") +
          ";"
        ),
        ``,
      ]
      : []
    ),

    /*
    `const spaceCodes = [`,
    `  9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200,`,
    `  8201, 8202, 8232, 8233, 8239, 8287, 12288`,
    `]`,
    ``,
    `const iswspace = (code) => spaceCodes.includes(code);`,
    */
    `const spaceCodeSet = new Set([`,
    `  9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200,`,
    `  8201, 8202, 8232, 8233, 8239, 8287, 12288`,
    `])`,
    ``,
    `/** @param {number} code */`,
    `const iswspace = (code) => spaceCodeSet.has(code);`,
    ``,
    // TODO restore. add only used charsugly
    ``,
    ...(
      state.scannerStateVars.length == 0 ? "" : [
        `// scanner state`,
        ...state.scannerStateVars.map(({name, type, value}) => {
          // TODO refactor tsType
          let tsType;
          const typesMap = {
            int: "number",
            wstring: "string", // TODO what is wstring
            bool: "boolean",
            // TODO more
          }
          if (type in typesMap) {
            type = typesMap[type]
          }
          let isConvertStringToArray = false
          let needsType = false
          if (type == "string") {
            // quickfix: lezer-parser returns characters as numbers
            // so instead of strings, we usually want Array<number>
            type = "array"
            tsType = "number[]"
            // TODO find next parent scope
            state.convertStringToArrayNames.add(name)
            isConvertStringToArray = true
            // TODO all arrays need type
            needsType = true
          }
          if (!value) {
            // we must set init value, otherwise ...
            // let s; s += 'x'; s == 'undefinedx'
            // let n; n += 1"; n == NaN
            const initValueOfType = {
              string: '""',
              number: '0',
              boolean: 'false',
              array: '[]',
              object: '{}',
            }
            // get init value, or make it explicitly undefined
            value = initValueOfType[type] || "undefined"
          }
          return (
            (
              isConvertStringToArray
              ? "/// converted string to number[]\n"
              : ""
            ) +
            (
              needsType
              ? `/** @type {${tsType || type}} */\n`
              : ""
            ) +
            `let ${name} = ${value};`
          );
        }),
        ``,
      ]
    ),

  ].map(line => line + "\n").join("")

  return fileHeader
}



export function getCode(tree, state) {
  let code = ""
  if (state.tokenTypeNames.length == 1) {
    // trivial case: only one entry point
    const name = state.tokenTypeNames[0]
    // jsdoc type. not needed
    //result += `export const ${getTokenName(name)} = new ExternalTokenizer(/** @type {ETF} */ (input) => {\n`
    code += `export const ${getTokenName(name, state)} = new ExternalTokenizer((input, stack) => {\n`
    code += `/// workaround for https://github.com/microsoft/TypeScript/issues/9998\n`
    code += `const inputNext = () => /** @type {number} */ input.next;\n`
    // TODO transpile the scan function
    //result += humanFormatNode(scanFuncNode, state, "/// @fn scan")

    let node = state.scanFuncNode
    node = firstChild(node)
    // return type
    node = nextSibling(node)
    // function head
    node = nextSibling(node)
    // function body
    //result += humanFormatNode(node, state, "/// @fn scan body")
    if (node.type.name == "CompoundStatement") {
      // if (cond) { expr... }
      node = firstChild(node) // "{"
      node = nextSibling(node)
      while (node) {
        if (node.type.name != "}") {
          code += node.type.format(node, state)
        }
        node = nextSibling(node)
      }
    }
    else {
      // if (cond) expr
      code += node.type.format(node, state)
    }
    // this causes double curly braces: { { ... } }
    //result += node.type.format(node, state)
    code += `},\n` // function end
    code += `{\n` // options start
    code += `  //contextual: true,\n`
    code += `  //fallback: true,\n`
    code += `  //extend: true,\n`
    code += `}\n` // options end
    code += `)\n` // ExternalTokenizer end
  }
  else {
    // multiple entry points
    for (const name of state.tokenTypeNames) {
      //result += `export const ${getTokenName(name)} = new ExternalTokenizer(/** @type {ETF} */ (input) => {\n`
      code += `export const ${getTokenName(name, state)} = new ExternalTokenizer((input, stack) => {\n`
      code += `/// workaround for https://github.com/microsoft/TypeScript/issues/9998\n`
      code += `const inputNext = () => /** @type {number} */ input.next;\n`
      // TODO find conditional block or codepath

      // TODO patch conditions
      // valid_symbols[${name}] -> true
      // valid_symbols[*] -> false
      // then, remove dead code (tree shaking)
      state.validSymbol = name

      let node = state.scanFuncNode
      node = firstChild(node)
      // return type
      node = nextSibling(node)
      // function head
      node = nextSibling(node)
      // function body
      //result += humanFormatNode(node, state, "/// @fn scan body")
      if (node.type.name == "CompoundStatement") {
        // if (cond) { expr... }
        node = firstChild(node) // "{"
        node = nextSibling(node)
        while (node) {
          if (node.type.name != "}") {
            //code += `/// @node ${node.type.name}\n`
            code += node.type.format(node, state)
          }
          node = nextSibling(node)
        }
      }
      else {
        // if (cond) expr
        //code += `/// @node ${node.type.name}\n`
        code += node.type.format(node, state)
      }
      // this causes double curly braces: { { ... } }
      //result += node.type.format(node, state)
      code += `},\n` // function end
      code += `{\n` // options start
      code += `  //contextual: true,\n`
      code += `  //fallback: true,\n`
      code += `  //extend: true,\n`
      code += `}\n` // options end
      code += `)\n` // ExternalTokenizer end
    }
  }
  code = getFileHeader(state) + code
  return code
}



export async function lintCode(code, eslintConfig) {
  const eslint = new ESLint({
    fix: true,
    useEslintrc: false,
    overrideConfig: eslintConfig,
  });

  const lintResults = await eslint.lintText(code, {filePath: "/output/scanner.js"});
  //await ESLint.outputFixes(lintResult);

  // print messages from eslint
  const formatter = await eslint.loadFormatter("stylish");
  const lintMessages = formatter.format(lintResults);
  if (lintResults[0].output) {
    code = lintResults[0].output;
  }
  if (lintMessages) {
    const ms = new MagicString(code)
    // @ts-ignore Value of type 'typeof LineColumnFinder' is not callable.
    const finder = lineColumn(code)
    //console.log(result) // debug: print ugly code
    for (const msg of lintResults[0].messages) {
      const idx = finder.toIndex(msg.line, msg.column)
      // debug
      /*
      console.dir({
        line: msg.line,
        column: msg.column,
        idx,
      })
      */
      // ${msg.line}:${msg.column} is the location in the ugly code, so its only useful for debugging
      //ms.appendRight(idx, commentLines(`eslint: ${msg.ruleId}: ${msg.message} ${msg.line}:${msg.column}`));
      ms.appendRight(idx, commentBlock(`eslint: ${msg.ruleId}: ${msg.message}`));
    }
    code = ms.toString()
  }
  return code
}



export function formatCode(code, prettierConfig) {
  try {
    code = prettierFormat(code, {filepath: "/output/scanner.js", text: code})
  }
  catch (error) {
    code += "\n" + commentLines(error.message)
    console.error(error)
  }
  return code
}
