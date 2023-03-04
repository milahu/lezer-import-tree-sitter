/*

FIXME
actual: "+=" == variable_operator
expected: variable_operator[0] == plus && variable_operator[1] == equal

.substr -> .slice

*/

import {ESLint} from "eslint"
import MagicString from "magic-string"
import lineColumn from 'line-column'
import {format as prettierFormat} from "prettier"
import { addSlashes, removeSlashes } from 'slashes'
import { minify as terserMinify } from 'terser'

// TODO? use code generator from https://github.com/yellicode/typescript-extension

import { firstChild, nextSibling, getParent, nodeText, findNode,
  filterNodes, reduceNodes, filterChildNodes } from './lezer-tree-query.js'
import { humanFormatNode, printNode, exitNode } from './lezer-tree-format.js'

// https://github.com/stdlib-js/string-base-format-tokenize/blob/main/lib/main.js
import formatTokenize from "./stdlib-string-base-format-tokenize.js";

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
      if (state.inputNextWorkaround) {
        // workaround for https://github.com/microsoft/TypeScript/issues/9998
        return "inputNext()"
      }
      return "input.next"
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
      substr: "slice", // string to number[]
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
    if (node.type.name == "FieldExpression") { // TODO what?
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
      // FIXME add "Scanner#variable_operator" in analyze pass
      // FIXME add "Scanner#variable_name" in analyze pass
      if (state.convertStringToArrayNames.has(name)) {
        // convert string to array
        //printNode(fullNode, state); console.dir({keys}); process.exit()
        if (keys.length == 1) {
          if (keys[0] == "empty") {
            // someString.empty() -> (someArray.length == 0)
            return `(${name}.length == 0)`
          }
          if (keys[0] == "clear") {
            // someString.clear() -> (someArray = [])
            return `${name} = []`
          }
          if (keys[0] == "length") {
            // someString.length() -> someArray.length
            return `${name}.length`
          }
          if (keys[0] == "size") {
            // someString.size() -> someArray.length
            return `${name}.length`
          }
          if (keys[0] == "c_str") {
            // someString.c_str() -> someArray
            return name;
          }
        }
        // TODO more
        console.error("FIXME handle string method")
        printNode(fullNode, state)
        console.error({keys})
        //process.exit()
      }
      console.error(`codegen 160: variable ${name} not found in state.convertStringToArrayNames: ${Array.from(state.convertStringToArrayNames).join(", ")}`)
      if (keys.slice(-1)[0] == "size") {
        // x.size() -> x.length
        // translate keys
        const keysMap = {
          size: "length",
        }
        // translate keys
        keys = keys.map(key => (key in keysMap) ? keysMap[key] : key)
        // debug
        if (
          name != "delimiter" &&
          keys[0] != "advance"
        ) {
          printNode(nameNode, state, "codegen 160: nameNode");
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
    if (name == "printf") {

      // parse arguments
      const args = []
      node = firstChild(node)
      while (node) {
        if (
          node.type.name != "(" &&
          node.type.name != "," &&
          node.type.name != ")"
        ) {
          //args.push(nodeText(node, state))
          args.push(formatNode(node, state))
        }
        node = nextSibling(node)
      }

      //console.log('codegen 250: args:', args)

      const formatStringRaw = args.shift()
      const formatString = formatStringRaw.slice(1, -1) // remove quotes "..."
      const formatTokens = formatTokenize(formatString)

      let result = ""
      //result += commentLines([formatString, ...args], 'codegen 250: args') + '\n'
      //result += commentLines(formatTokens, 'codegen 250: formatTokens') + '\n'
      const lastToken = formatTokens.slice(-1)[0] || ""
      if (lastToken.endsWith("\\n")) {
        result += 'console.log(`'
        formatTokens[formatTokens.length - 1] = lastToken.slice(0, -2) // remove \n
      }
      else {
        result += 'process.stdout.write(`'
      }
      for (const token of formatTokens) {
        if (typeof token == 'string') {
          // fixed string
          result += token.replace(/\$\{/g, '\\${')
        }
        else {
          // interpolation
          const valueExpr = args.shift()
          // TODO inverse of convertStringToArrayNames
          // convert number[] to string
          // convert number to char
          if (state.convertStringToArrayNames.has(valueExpr)) {
            result += '${strArr(' + valueExpr + ')}'
          }
          else {
            result += '${' + valueExpr + '}'
          }
        }
      }
      result += '`)'
      return result
    }
    return (
      //todoNode(fullNode, state) +
      unwrapNode(fullNode, state)
    )
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
      const rawName = nodeText(rightNode, state)
      //console.error("AssignmentExpression: rawName", rawName)
      const tokenName = getTokenName(rawName, state)
      if (tokenName != rawName) {
        // global constant -> prefix
        return (
          "\n" +
          //commentLines("TODO arguments?\n" + nodeText(fullNode, state)) +
          `input.acceptToken(${state.tokenNamePrefix}${tokenName})`
        )
      }
      else {
        // local variable -> no prefix
        return (
          "\n" +
          //commentLines("TODO arguments?\n" + nodeText(fullNode, state)) +
          `input.acceptToken(${tokenName})`
        )
      }
    }
    if (state.convertStringToArrayNames.has(name)) {
      // convert string to array
      // FIXME: variable_operator = "";
      // string to number[]

      let numberArrayExpr = ""
      // prefix before the assignment expression
      let exprPrefix = ""

      if (rightNode.type.name == "String") {
        const quotedString = formatNode(rightNode, state)
        const string = quotedString.slice(1, -1)
        const numberArray = string.split("").map(c => c.charCodeAt(0))
        numberArrayExpr = `[${numberArray.join(", ")}]`
      }
      else {
        // FIXME we need the type of variable in expr
        // expr is number -> push(expr) // frequent case
        // expr is number[] -> push(...expr) // rare case
        const rightNodeText = formatNode(rightNode, state)
        // frequent case: expr is number
        exprPrefix = [
          `if (debug && !(typeof ${rightNodeText} == "number")) {`,
          (
            `throw new Error(\`type error in variable ${rightNodeText}: ` +
            `expected number, actual \${typeof ${rightNodeText}}\`);`
          ),
          `}`,
        ].join("\n") + "\n"
        numberArrayExpr = `[${rightNodeText}]`
        // rare case: expr is number[]
        //numberArrayExpr = rightNodeText
        // switch on runtime: slow
        //numberArrayExpr = `Array.isArray(${rightNodeText}) ? ${rightNodeText} : [${rightNodeText}]` + commentBlock(`FIXME: assert: typeof ${rightNodeText} == number`)
      }

      let result = (
          `/// converted string to number[]\n` +
          commentLines(nodeText(rightNode, state), "string node") + "\n"
      )
      if (operatorText == "+=") {
        result += exprPrefix + `${name}.push(...${numberArrayExpr})`
      }
      else {
        // operatorText == "="
        result += exprPrefix + `${name} = ${numberArrayExpr}`
      }
      return result
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
    let code = char.charCodeAt(0)
    if (code == 0) {
      // end of file
      // tree-sitter: lexer->lookahead == 0 // FIXME IfExpression
      // tree-sitter: switch (lexer->lookahead) { case '\0': // CaseExpression
      // lezer-parser: input.next == -1
      code = -1
    }
    state.usedAsciiCodes.add(code)
    const name = state.asciiNames[code]
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
    if (type in tsTypeOfCType) {
      type = tsTypeOfCType[type]
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
        if (type in tsTypeOfCType) {
          type = tsTypeOfCType[type];
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
    //result += todoNode(node, state)
    /*
      example 1:
      CaseStatement: "case '\\0':"
        case: "case"
        CharLiteral: "'\\0'"
          EscapeSequence: "\\0"
        CompoundStatement: "{"

      example 2:
      CaseStatement: "default: {"
        default: "default"
        CompoundStatement: "{"
    */
    node = firstChild(node) // "case" or "default"
    const isDefault = nodeText(node, state) == "default"
    if (isDefault) {
      result += `default:\n`
    }
    else {
      node = nextSibling(node) // value
      const value = node.type.format(node, state)
      result += `case ${value}:\n`
    }
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
    /*
      example:
      SubscriptExpression: "valid_symbols[VARIABLE_NAME]"
        Identifier: "valid_symbols"
        [: "["
        Identifier: "VARIABLE_NAME"
        ]: "]"
    */
    const fullNode = node
    node = firstChild(node)
    //const name = node.type.format(node, state)
    const name = nodeText(node, state)
    node = nextSibling(node) // "["
    node = nextSibling(node)
    //const key = node.type.format(node, state) // no. Identifier would translate VARIABLE_NAME to Tokens.VariableName etc
    const key = nodeText(node, state)
    // must trim name and key, because copyNodeSpace adds whitespace
    if (name.trim() == state.validSymbolsName) {
      // patch conditions
      // valid_symbols[${name}] -> true
      // valid_symbols[*] -> false
      return (
        //commentBlock({name, key, validSymbolsName: state.validSymbolsName, validSymbolsKey: state.validSymbolsKey}) +
        commentBlock(nodeText(fullNode, state), "evaluated") +
        //commentBlock({name, key}) +
        ((state.validSymbolsKey == key.trim()) ? "true" : "false")
      )
    }
    return (
      //commentBlock({name, key, validSymbolsName: state.validSymbolsName, validSymbolsKey: state.validSymbolsKey}) +
      //todoNode(fullNode, state) +
      unwrapNode(fullNode, state)
    )
  },
  FunctionDefinition(node, state) {
    /*
      example:
      FunctionDefinition: "void skip(TSLexer *lexer) {"
        PrimitiveType: "void"
        FunctionDeclarator: "skip(TSLexer *lexer)"
          FieldIdentifier: "skip"
          ParameterList: "(TSLexer *lexer)"
            (: "("
            ParameterDeclaration: "TSLexer *lexer"
              TypeIdentifier: "TSLexer"
              PointerDeclarator: "*lexer"
                Identifier: "lexer"
            ): ")"
        CompoundStatement: "{"
          {: "{"
          ExpressionStatement: "lexer->advance(lexer, true);"
    */

    printNode(node, state, "codegen 600: FunctionDefinition")

    let result = ""

    node = firstChild(node) // return type or "inline"
    if (node.type.name == "inline") {
      node = nextSibling(node) // return type
    }

    let isConstructor = false
    if (node.type.name == "FunctionDeclarator") {
      // constructor function has no return type
      isConstructor = true
      // FIXME constructor is never called
    }
    else {
      // node is return type
      //printNode(node, state, "codegen: return type")
      // TODO translate cppType to tsType
      result += `/** @return {${node.type.format(node, state)}} */\n`

      node = nextSibling(node) // FunctionDeclarator
    }

    printNode(node, state, "codegen 600: FunctionDeclarator")
    const functionDeclaratorNode = node

    node = firstChild(node) // FieldIdentifier (function is class method)
    //printNode(node, state, "codegen: FieldIdentifier")
    const name = nodeText(node, state)
    if (name.match(/^(serialize|deserialize).*/)) {
      // ignore the "serialize" and "deserialize" functions
      // TODO also ignore:
      // tree_sitter_${language_name}_external_scanner_serialize
      // tree_sitter_${language_name}_external_scanner_deserialize
      return "";
    }
    console.error(`codegen 600: name = ${name}`)
    result += `function ${name}`

    node = nextSibling(node) // ParameterList
    //printNode(node, state, "codegen: ParameterList")
    result += node.type.format(node, state)

    node = nextSibling(functionDeclaratorNode) // CompoundStatement
    // FIXME node is null
    result += node.type.format(node, state)

    return result
  },
  ParameterDeclaration(node, state) {
    /*
      example:
      ParameterDeclaration: "TSLexer *lexer"
        TypeIdentifier: "TSLexer"
        PointerDeclarator: "*lexer"
          Identifier: "lexer"
    */
    node = firstChild(node) // TypeIdentifier
    const type = nodeText(node, state)
    if (type == "TSLexer") {
      return "/** @type {InputStream} */ input"
    }
    // similar to CastExpression
    /*
      example:
      ParameterDeclaration: "TokenType middle_type"
        TypeIdentifier: "TokenType"
        Identifier: "middle_type"
    */
    node = nextSibling(node) // Identifier or PointerDeclarator
    let isPointer = false
    if (node.type.name == "PointerDeclarator") {
      node = firstChild(node)
      isPointer = true
    }
    const name = nodeText(node, state)
    const tsType = tsTypeOfCType[type]
    return (
      (isPointer ? "/* @todo pointer */" : "") +
      `/** @type {${tsType || type}} */ ${name}`
    )
  },
  _ParameterList(node, state) {
    /*
      example:
      ParameterList: "(TSLexer *lexer)"
        (: "("
        ParameterDeclaration: "TSLexer *lexer"
          TypeIdentifier: "TSLexer"
          PointerDeclarator: "*lexer"
            Identifier: "lexer"
        ): ")"
    */
    let result = ""
    node = firstChild(node) // "("
    // TODO translate cppType to tsType
    result += `/** @return {${node.type.format(node, state)}} */\n`
    node = nextSibling(node) // FunctionDeclarator
    const functionDeclaratorNode = node
    node = firstChild(node) // FieldIdentifier (function is class method)
    const name = nodeText(node, state)
    result += `function ${name}`
    node = nextSibling(node) // ParameterList
    result += node.type.format(node, state)
    node = nextSibling(functionDeclaratorNode) // CompoundStatement
    result += node.type.format(node, state)
    return result
  },
  PrimitiveType(node, state) {
    const type = nodeText(node, state)
    if (type in tsTypeOfCType) {
      return tsTypeOfCType[type]
    }
    else {
      return todoNode(node, state)
    }
  },
  CastExpression(node, state) {
    /*
      example:
      CastExpression: "(int32_t)heredoc_delimiter[i++]"
        (: "("
        TypeDescriptor: "int32_t"
          PrimitiveType: "int32_t"
        ): ")"
        SubscriptExpression: "heredoc_delimiter[i++]"
          Identifier: "heredoc_delimiter"
          [: "["
          UpdateExpression: "i++"
            Identifier: "i"
            UpdateOp: "++"
          ]: "]"
    */
    node = firstChild(node) // "("
    node = nextSibling(node) // TypeDescriptor
    const type = node.type.format(node, state)
    const tsType = tsTypeOfCType[type]
    node = nextSibling(node) // ")"
    node = nextSibling(node) // expr
    const expr = node.type.format(node, state)
    return `/** @type {${tsType || type}} */ ${expr}`
  },
  Identifier(node, state) {
    const name = nodeText(node, state)
    const namesMap = {
      lexer: "input",
      // TODO more?
    }
    if (name in namesMap) {
      return namesMap[name]
    }
    const newName = getTokenName(name, state)
    if (newName != name) {
      return (
        // FIXME input.acceptToken(Tokens.end_type); should be input.acceptToken(end_type);
        // -> CallExpression
        //commentBlock({name, newName}) +
        state.tokenNamePrefix + newName
      )
    }
    return name
  },
  BinaryExpression(node, state) {
    let result = ""

    const leftNode = firstChild(node)
    const left = formatNode(leftNode, state)
    const operatorNode = nextSibling(leftNode)
    const operator = formatNode(operatorNode, state)
    const rightNode = nextSibling(operatorNode)
    const right = formatNode(rightNode, state)

    // TODO micro optimize
    // input: s == "ab"
    // slow output: strArr(s) == "ab"
    // fast output: s[0] == 97 && s[1] == 98

    /*
      example:
      BinaryExpression: "variable_operator == \"+=\""
        Identifier: "variable_operator"
        CompareOp: "=="
        String: "\"+=\""
    */

    if (
      operatorNode.type.name == "CompareOp" &&
      (
        leftNode.type.name == "String" ||
        rightNode.type.name == "String"
      )
    ) {

      if (
        leftNode.type.name == "Identifier" &&
        state.convertStringToArrayNames.has(left)
        // &&
        //operatorNode.type.name == "CompareOp" &&
        //rightNode.type.name == "String"
      ) {
        return `strArr(${left}) ${operator} ${right}`
      }

      if (
        //leftNode.type.name == "String" &&
        //operatorNode.type.name == "CompareOp" &&
        rightNode.type.name == "Identifier" &&
        state.convertStringToArrayNames.has(right)
      ) {
        return `${left} ${operator} strArr(${right})`
      }

      /*
        example:
        BinaryExpression: "variable_value.substr(0, 4) == \"$() \""
          CallExpression: "variable_value.substr(0, 4)"
            FieldExpression: "variable_value.substr"
              Identifier: "variable_value"
              FieldIdentifier: "substr"
            ArgumentList: "(0, 4)"
              (: "("
              Number: "0"
              ,: ","
              Number: "4"
              ): ")"
          CompareOp: "=="
          String: "\"$() \""
      */
      // note:
      // variable_value.substr(0, 4) is converted by formatNode to
      // variable_value.slice(0, 4)

      if (
        leftNode.type.name == "CallExpression" &&
        firstChild(leftNode).type.name == "FieldExpression" &&
        firstChild(firstChild(leftNode)).type.name == "Identifier" &&
        state.convertStringToArrayNames.has(nodeText(firstChild(firstChild(leftNode)), state))
        // &&
        //operatorNode.type.name == "CompareOp" &&
        //rightNode.type.name == "String"
      ) {
        return `strArr(${left}) ${operator} ${right}`
      }

      if (
        //leftNode.type.name == "String" &&
        //operatorNode.type.name == "CompareOp" &&
        rightNode.type.name == "CallExpression" &&
        firstChild(rightNode).type.name == "FieldExpression" &&
        firstChild(firstChild(rightNode)).type.name == "Identifier" &&
        state.convertStringToArrayNames.has(nodeText(firstChild(firstChild(rightNode)), state))
      ) {
        return `${left} ${operator} strArr(${right})`
      }

      // unhandled string compare
      result += todoNode(node, state)

    }

    // TODO compare 2 members of state.convertStringToArrayNames
    // for loop?
    /*
      function strArrEqual(a, b) {
        if (a.length != b.length) return false
        for (let i = 0; i < a.length; i++) {
          if (a[i] != b[i]) return false
        }
        return true
      }
    */

    // simple case
    result += unwrapNode(node, state)
    return result
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
  //const newNames = ["Todo", "Todo2"]

  const fileHeader = [
    //`// tokens.js`,
    `// scanner.js - generated from scanner.cc`,
    //`/// TODO translate functions from scanner.c`,
    ``,
    `// global defines`,
    (
      `const debug = ["1", "true"].includes(` +
      `(typeof process != "undefined" && process.env.DEBUG_LEZER_PARSER_${state.languageNameUpper}) || ` +
      `globalThis.DEBUG_LEZER_PARSER_${state.languageNameUpper})`
    ),
    ...Object.entries(state.globalDefines).map(([key, val]) => `const ${key} = ${val}`),
    ``,
    `// lezer`,
    /*
    `import {`,
    `  ExternalTokenizer,`,
    `  //ContextTracker,`,
    `} from "@lezer/lr"`,
    */
    `import { ExternalTokenizer } from "@lezer/lr"`,
    // https://lezer.codemirror.net/docs/ref/#lr.InputStream
    `/** @typedef {import("@lezer/lr").InputStream} InputStream */`,
    ``,
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
    `// constants`,
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
    `const spaceNums = new Set([`,
    `  9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200,`,
    `  8201, 8202, 8232, 8233, 8239, 8287, 12288`,
    `])`,
    ``,
    `// functions`,
    `/** @param {number} num */`,
    `const iswspace = (num) => spaceNums.has(num);`,
    ``,
    `/** @param {number} num */`,
    `const iswdigit = (num) => (48 <= num && num <= 57);`,
    ``,
    `/** @param {number} code */`,
    //`const iswalpha = (num) => ((65 <= num && num <= 90) || (97 <= num && num <= 122));`,
    `const iswalpha = (num) => (65 <= num && num <= 122 && (num <= 90 || 97 <= num));`,
    ``,
    `const abort = () => { throw new Error("abort"); };`,
    ``,
    `/** @type {(arr: number[]) => string} */`,
    `const strArr = (arr) => arr.map(num => String.fromCharCode(num)).join('');`,
    ``,
    `/** @type {(num: number) => string} */`,
    `const charNum = (num) => String.fromCharCode(num);`,
    ``,
    // TODO restore. add only used chars
    ``,
    ...(
      state.scannerStateVars.length == 0 ? "" : [
        `// scanner state`,
        ...state.scannerStateVars.map(({name, type, value}) => {
          // TODO refactor tsType
          let tsType;
          if (type in tsTypeOfCType) {
            type = tsTypeOfCType[type]
          }
          let isConvertStringToArray = false
          //let needsType = false
          let needsType = true // verbose. make all types explicit
          if (type == "string" || type == "std::string") {
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
  code += getScanFunctions(state)
  code += getOtherFunctions(state)
  code = getFileHeader(state) + code
  return code
}



function getScanFunctions(state) {
  let code = ""
  if (state.tokenTypeNames.length == 1) {
    // trivial case: only one entry point
    const name = state.tokenTypeNames[0]
    // jsdoc type. not needed
    //result += `export const ${getTokenName(name)} = new ExternalTokenizer(/** @type {ETF} */ (input) => {\n`
    //code += `export const ${getTokenName(name, state)} = new ExternalTokenizer((input, stack) => {\n`
    code += `export const ${getTokenName(name, state)} = new ExternalTokenizer((input) => {\n`
    if (state.inputNextWorkaround) {
      code += `/// workaround for https://github.com/microsoft/TypeScript/issues/9998\n`
      code += `const inputNext = () => /** @type {number} */ input.next;\n`
    }
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
    code += `}\n` // function end
    /*
    code += `},\n` // function end
    code += `{\n` // options start
    code += `  //contextual: true,\n`
    code += `  //fallback: true,\n`
    code += `  //extend: true,\n`
    code += `}\n` // options end
    */
    code += `)\n` // ExternalTokenizer end
  }
  else {
    // multiple entry points
    for (const name of state.tokenTypeNames) {
      //result += `export const ${getTokenName(name)} = new ExternalTokenizer(/** @type {ETF} */ (input) => {\n`
      //code += `export const ${getTokenName(name, state)} = new ExternalTokenizer((input, stack) => {\n`
      code += `export const ${getTokenName(name, state)} = new ExternalTokenizer((input) => {\n`
      if (state.inputNextWorkaround) {
        code += `/// workaround for https://github.com/microsoft/TypeScript/issues/9998\n`
        code += `const inputNext = () => /** @type {number} */ input.next;\n`
      }
      // TODO find conditional block or codepath

      // patch conditions in SubscriptExpression
      state.validSymbolsKey = name
      // then, remove dead code (tree shaking)
      // if (false) { ... } -> (remove)
      // if (true) expr -> expr

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
        // no curly braces: if (cond) expr
        //code += `/// @node ${node.type.name}\n`
        code += node.type.format(node, state)
      }
      // this causes double curly braces: { { ... } }
      //result += node.type.format(node, state)
      code += `}\n` // function end
      /*
      code += `},\n` // function end
      code += `{\n` // options start
      code += `  //contextual: true,\n`
      code += `  //fallback: true,\n`
      code += `  //extend: true,\n`
      code += `}\n` // options end
      */
      code += `)\n` // ExternalTokenizer end
    }
  }
  return code
}



function getOtherFunctions(state) {
  let code = ""
  // transpile other functions of "struct Scanner"
  let node = state.scannerStructNode
  //code += todoNode(node, state)
  /*
  example:
  StructSpecifier: "struct Scanner {"
    struct: "struct"
    TypeIdentifier: "Scanner"
    FieldDeclarationList: "{"
      {: "{"
      FunctionDefinition: "void skip(TSLexer *lexer) {"
  */
  node = firstChild(node) // struct: "struct"
  node = nextSibling(node) // TypeIdentifier
  node = nextSibling(node) // FieldDeclarationList
  node = firstChild(node) // "{"
  node = nextSibling(node)
  while (node) {
    if (node.type.name == "FunctionDefinition") {
      printNode(node, state, "codegen 1200: FunctionDefinition")
      const funcNode = node
      node = firstChild(node) // return type or "inline"
      if (node.type.name == "inline") {
        node = nextSibling(node) // return type
      }
      printNode(node, state, "codegen 1200: return type")
      node = nextSibling(node) // FunctionDeclarator: "serialize(char *buffer)"
      printNode(node, state, "codegen 1200: FunctionDeclarator")
      node = firstChild(node) // FieldIdentifier
      printNode(node, state, "codegen 1200: FieldIdentifier")
      const name = nodeText(node, state)
      if (
        state.ignoreScannerMethods.has(name) == false &&
        name != "scan"
      ) {
        code += funcNode.type.format(funcNode, state)
      }
      node = funcNode
    }
    node = nextSibling(node)
  }
  return code
}



export async function minifyCode(code, terserConfig) {
  try {
    const terserResult = await terserMinify(code, terserConfig)
    return terserResult.code
  }
  catch (error) {
    return code + "\n" + commentBlock(error)
  }
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
    console.error("ugly result code:")
    console.error(code)
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
