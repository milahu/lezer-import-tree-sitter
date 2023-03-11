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

const transpileOfNodeType = {
  ParserRuleSpecContext(node, state) {
    printNode(node, state)
    throw Error("TODO")
  },
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
}



// trivial transpilers

transpileOfNodeType.GrammarSpecContext = unwrapNode // root node

transpileOfNodeType.GrammarDeclContext = ignoreNode
transpileOfNodeType.PrequelConstructContext = ignoreNode // example: tokenVocab=CPP14Lexer

transpileOfNodeType.RulesContext = unwrapNode
transpileOfNodeType.RuleSpecContext = unwrapNode

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
  return `// FIXME codegen\n` + formatNode(tree, state)
  return todoNode(tree, state)
  return nodeText(tree, state)
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
    if (nodeType(node) == "CompoundStatement") {
      // if (cond) { expr... }
      node = firstChild(node) // "{"
      node = nextSibling(node)
      while (node) {
        if (nodeType(node) != "}") {
          code += formatNode(node, state)
        }
        node = nextSibling(node)
      }
    }
    else {
      // if (cond) expr
      code += formatNode(node, state)
    }
    // this causes double curly braces: { { ... } }
    //result += formatNode(node, state)
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
      if (nodeType(node) == "CompoundStatement") {
        // if (cond) { expr... }
        node = firstChild(node) // "{"
        node = nextSibling(node)
        while (node) {
          if (nodeType(node) != "}") {
            //code += `/// @node ${nodeType(node)}\n`
            code += formatNode(node, state)
          }
          node = nextSibling(node)
        }
      }
      else {
        // no curly braces: if (cond) expr
        //code += `/// @node ${nodeType(node)}\n`
        code += formatNode(node, state)
      }
      // this causes double curly braces: { { ... } }
      //result += formatNode(node, state)
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
    if (nodeType(node) == "FunctionDefinition") {
      printNode(node, state, "codegen 1200: FunctionDefinition")
      const funcNode = node
      node = firstChild(node) // return type or "inline"
      if (nodeType(node) == "inline") {
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
