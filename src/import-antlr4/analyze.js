import path from "path"

/** @typedef {import("@lezer/common").SyntaxNode} SyntaxNode */
/** @typedef {import("@lezer/common").Tree} Tree */

import { firstChild, nextSibling, getParent, nodeText, findNode, filterNodes,
  reduceNodes, filterChildNodes } from './query.js'

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



  //console.dir({state.scannerStateVars})
  //process.exit()
}
