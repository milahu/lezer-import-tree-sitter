/** @typedef {import("@lezer/common").SyntaxNode} SyntaxNode */
/** @typedef {import("@lezer/common").Tree} Tree */

import { firstChild, nextSibling, getParent, nodeText, findNode, filterNodes,
  reduceNodes, filterChildNodes } from './lezer-tree-query.js'

/**
 * analyze tree, populate state
 * @param {Tree} tree
 * @param {any} state
 * @return {void}
 */

export function analyze(tree, state) {

  state.externalNames = state.grammar.externals.map(external => {
    if (external.type == "SYMBOL") {
      return external.name
    }
    if (external.type == "STRING") {
      const name = external.value.split("").map(c => state.asciiNames[c.charCodeAt(0)]).join("_")
      //console.error(`external string: ${JSON.stringify(external.value)} -> ${name}`)
      /*
        examples:
        external string: "}" -> curlyClose
        external string: "]" -> bracketClose
        external string: "<<" -> angleOpen_angleOpen
        external string: "<<-" -> angleOpen_angleOpen_minus
        external string: "\n" -> LF
      */
      return name
    }
    console.error({external})
    throw new Error("not implemented: external type " + external.type)
  })

  // find "enum TokenType"
  // "enum TokenType" has the same order as the "externals" rule in tree-sitter grammar.js
  // these are "entry points" for the scan function
  // trivial case: only one value in enum TokenType, example: tree-sitter-cpp

  state.tokenTypeEnumNode = findNode(tree, (node) => {
    if (node.type.name != "EnumSpecifier") {
      return false
    }
    node = firstChild(node)
    // struct
    //printNode(node, state, "struct")
    node = nextSibling(node)
    // TypeIdentifier
    //printNode(node, state, "TypeIdentifier")
    const name = nodeText(node, state)
    return (name == "TokenType")
  })

  //printNode(tokenTypeEnumNode, state)

  state.tokenTypeNames = reduceNodes(state.tokenTypeEnumNode, (/** @type {string[]} */ acc, node) => {
    if (node.type.name == "Enumerator") {
      acc.push(nodeText(node, state))
    }
    return acc
  }, [])

  if (state.tokenTypeNames.length == 0) {
    throw new Error("not found token type names")
  }

  //console.dir({state.tokenTypeNames})



  state.externalOfTokenType = state.tokenTypeNames.reduce((acc, name, idx) => {
    acc[name] = state.externalNames[idx];
    return acc
  }, {})

  //console.dir({state.externalOfTokenType})



  // find the Scanner struct
  state.scannerStructNode = findNode(tree, (node) => {
    if (node.type.name != "StructSpecifier") {
      return false
    }
    node = firstChild(node)
    // struct
    //printNode(node, state, "struct")
    node = nextSibling(node)
    // TypeIdentifier
    //printNode(node, state, "TypeIdentifier")
    const name = nodeText(node, state)
    return (name == "Scanner")
  })



  // find the Scanner.scan function
  state.scanFuncNode = findNode(state.scannerStructNode, (node) => {
    if (node.type.name != "FunctionDefinition") {
      return false
    }
    node = firstChild(node)
    // returntype
    //printNode(node, state, "returntype")
    node = nextSibling(node)
    // FunctionDeclarator
    //printNode(node, state, "TypeIdentifier")
    node = firstChild(node)
    // FieldIdentifier
    const name = nodeText(node, state)
    return (name == "scan")
  })



  // get name of second argument, usually "valid_symbols"
  state.validSymbolsName = ""
  {
    let node = state.scanFuncNode
    node = firstChild(node)
    // return type
    node = nextSibling(node) // FunctionDeclarator: "scan(TSLexer *lexer, const bool *valid_symbols)"
    // function head
    node = firstChild(node) // FieldIdentifier: "scan"
    node = nextSibling(node) // ParameterList: "(TSLexer *lexer, const bool *valid_symbols)"
    //console.error(formatNode(node, state, "paramList"))
    node = firstChild(node) // (: "("
    node = nextSibling(node) // ParameterDeclaration: "TSLexer *lexer"
    // parameter 1
    //console.error(formatNode(node, state, "param1"))
    node = nextSibling(node) // ","
    node = nextSibling(node) // ParameterDeclaration: "const bool *valid_symbols"
    // parameter 2
    //console.error(formatNode(node, state, "param2"))
    const paramNode = node
    node = firstChild(node) // (: "("
    // seek to last child
    let nextNode = nextSibling(node)
    while (nextNode) {
      node = nextNode
      nextNode = nextSibling(nextNode)
    }
    // node: PointerDeclarator: "*valid_symbols"
    if (node.type.name == "PointerDeclarator") {
      node = firstChild(node) // Identifier: "valid_symbols"
      state.validSymbolsName = nodeText(node, state)
    }
    else {
      console.error(`not implemented: param node type ${node.type.name}`)
      console.error(formatNode(paramNode, state, "param"))
      process.exit(1)
    }
  }
  //console.error(`validSymbolsName: ${validSymbolsName}`)



  // find state variables of "struct Scanner"
  /*
  example: tree-sitter-bash/src/scanner.cc
  namespace {
    struct Scanner {
      string heredoc_delimiter;
      bool heredoc_is_raw;
      bool started_heredoc;
      bool heredoc_allows_indent;
      string current_leading_word;
    };
  }

  StructSpecifier: "struct Scanner {"
    struct: "struct"
    TypeIdentifier: "Scanner"
    FieldDeclarationList: "{"
      {: "{"
      FunctionDefinition: "void skip(TSLexer *lexer) {"
        ...
      FunctionDefinition: "void advance(TSLexer *lexer) {"
        ...
      FieldDeclaration: "string heredoc_delimiter;"
        TypeIdentifier: "string"
        FieldIdentifier: "heredoc_delimiter"
      FieldDeclaration: "bool heredoc_is_raw;"
        PrimitiveType: "bool"
        FieldIdentifier: "heredoc_is_raw"
      FieldDeclaration: "bool started_heredoc;"
        PrimitiveType: "bool"
        FieldIdentifier: "started_heredoc"
      FieldDeclaration: "bool heredoc_allows_indent;"
        PrimitiveType: "bool"
        FieldIdentifier: "heredoc_allows_indent"
      FieldDeclaration: "string current_leading_word;"
        TypeIdentifier: "string"
        FieldIdentifier: "current_leading_word"
      }: "}"
  */

  state.scannerStructFieldList = findNode(state.scannerStructNode,
    (node) => (node.type.name == "FieldDeclarationList"))

  state.scannerStructFieldNodes = filterChildNodes(state.scannerStructFieldList,
    (node) => (node.type.name == "FieldDeclaration"))

  /*
  for (const node of state.scannerStructFieldNodes) {
    printNode(node, state)
  }
  */

  state.scannerStateVars = state.scannerStructFieldNodes.map(
    (node) => {
      node = firstChild(node)
      const type = nodeText(node, state)
      node = nextSibling(node)
      const name = nodeText(node, state)
      if (type == "string") {
        state.convertStringToArrayNames.add(name)
      }
      const value = ""; // TODO use actual init value if exists
      return { type, name, value }
    }
  )

  //console.dir({state.scannerStateVars})
  //process.exit()
}
