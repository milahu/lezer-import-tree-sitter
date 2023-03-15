import path from "path"

/** @typedef {import("@lezer/common").SyntaxNode} SyntaxNode */
/** @typedef {import("@lezer/common").Tree} Tree */

import { firstChild, nextSibling, getParent, nodeText, nodeType, findNode,
  filterNodes, reduceNodes, filterChildNodes } from './query.js'

import { humanFormatNode, printNode, exitNode } from './format.js'

/**
 * analyze tree, populate state
 * @param {Tree} tree
 * @param {any} state
 * @return {void}
 */

export function analyze(state) {

  /// @todo(GrammarSpecContext)   GrammarDeclContext: "parsergrammarCPP14Parser;"
  /// @todo(GrammarSpecContext)     GrammarTypeContext: "parsergrammar"
  /// @todo(GrammarSpecContext)       c: "parser"
  /// @todo(GrammarSpecContext)     IdentifierContext: "CPP14Parser"
  /// @todo(GrammarSpecContext)       c: "CPP14Parser"
  state.languageName = path.basename(state.sourcePath, path.extname(state.sourcePath))
  state.languageNameUpper = state.languageName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")

  state.parserRuleNames = []
  state.lexerRuleNames = []

  //console.log(`analyze: state.parserTree:`, state.parserTree)

  // visit trees to get ruleNames
  getRuleNames(state.parserTree, state)
  if (state.lexerTree) {
    getRuleNames(state.lexerTree, state)
  }

  //console.dir({state.scannerStateVars})
  //process.exit()
}



function getRuleNames(node, state) {
  const type = nodeType(node)
  //console.log("getRuleNames: node:", node)
  //console.log("getRuleNames: type:", type)
  function addName(node, state, ruleNames) {
    let name = nodeText(node.children[0], state)
    if (
      name == "fragment" &&
      nodeText(node.children[1], state) != ":"
    ) {
      // hide fragment tokens
      return
      //name = nodeText(node.children[1], state)
    }
    ruleNames.push(name)
  }
  switch (type) {
    case "ParserRuleSpecContext": {
      addName(node, state, state.parserRuleNames)
      return
    }
    case "LexerRuleSpecContext": {
      addName(node, state, state.lexerRuleNames)
      return
    }
    default: {
      // unwrap node
      node = firstChild(node)
      while (node) {
        getRuleNames(node, state)
        node = nextSibling(node)
      }
      return
    }
  }
}
