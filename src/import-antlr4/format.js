/** @typedef {import("@lezer/common").SyntaxNode} SyntaxNode */
/** @typedef {import("@lezer/common").Tree} Tree */

import { firstChild, nextSibling, getParent, nodeText, nodeType, findNode,
  filterNodes, reduceNodes, filterChildNodes } from './query.js'



/** @type {(node: Tree | SyntaxNode, options: any) => string} */
export function stringifyTree(tree, options) {

  if (!options) options = {};
  const pretty = options.pretty || false;
  const human = options.human || false; // human readable, like python or yaml
  const positions = options.positions || false; // add node positions
  const firstLine = options.firstLine || false; // show only first line of node source
  const compact = (!pretty && !human);
  const format = compact ? 'compact' : pretty ? 'pretty' : human ? 'human' : null;
  const source = options.source || options.text || '';
  const indentStep = options.indent || '  ';

  //const cursor = tree.cursor();
  //if (!cursor) return '';

  let node = tree;

  let depth = 0;
  let result = '';

  const indent = () => indentStep.repeat(depth);
  const cursorType = () => positions ? `${nodeType(node)}:${node.from}` : nodeType(node);
  const cursorText = () => {
    return node.getText();
    //console.log("node:", node)
    //console.log("node.start:", node.start)
    //console.log("node.stop:", node.stop)
    console.log(`cursorText(${node.start?.start}-${node.stop?.stop})`);
    let src = source.slice(node.start.start, node.stop.stop);
    if (firstLine) {
      src = src.split('\n')[0];
    }
    console.log(`cursorText(${node.start?.start}-${node.stop?.stop}) -> ${JSON.stringify(src).slice(0, 100)}`);
    return src;
  };

  const formatNodeByFormat = {
    //human: () => `${indent()}${cursorType()}: ${cursorText()}\n`,
    human: () => `${indent()}${cursorType()}: ${JSON.stringify(cursorText())}\n`,
    pretty: () => `${indent()}${cursorType()}`,
    compact: () => cursorType(),
  };
  const formatNode = formatNodeByFormat[format];

  let nextNode = null
  let nextNodeInner = null

  while (true) {
    // NLR: Node, Left, Right
    // Node
    result += formatNode()
    // Left
    nextNode = firstChild(node)
    if (nextNode) {
      node = nextNode
      // moved down
      depth++;
      if (compact) result += '('
      if (pretty) result += ' (\n'
      continue;
    }
    // Right
    nextNode = nextSibling(node)
    if (depth > 0 && nextNode) {
      node = nextNode
      // moved right
      if (compact) result += ','
      if (pretty) result += ',\n'
      continue;
    }
    let continueMainLoop = false;
    let firstUp = true;
    while (nextNode = getParent(node)) {
      node = nextNode
      // moved up
      depth--;
      //console.log(`stringifyTree: moved up to depth=${depth}. result: ${result}`)
      //if (depth < 0) { // wrong?
      if (depth <= 0) {
        // when tree is a node, stop at the end of node
        // == dont visit sibling or parent nodes
        return result;
      }
      if (compact) result += ')'
      if (pretty && firstUp) result += `\n`
      if (pretty) result += `${indent()})`
      nextNode = nextSibling(node)
      if (nextNode) {
        node = nextNode
        // moved up + right
        continueMainLoop = true;
        if (compact) result += ','
        if (pretty) result += ',\n'
        break;
      }
      if (pretty) result += `\n`
      firstUp = false;
    }
    if (continueMainLoop) continue;

    break;
  }

  //console.log(`stringifyTree: final depth: ${depth}`)

  return result;
}



/** @type {(node: SyntaxNode, state: any, label: string) => string} */
//export function formatNode(node, state, label = "") {
export function humanFormatNode(node, state, label = "") {
  const s = stringifyTree(node, {
    source: state.source,
    human: true,
    firstLine: true,
  })
  if (label) {
    return s.split("\n").map(line => label + ": " + line).join("\n")
  }
  else {
    return s
  }
}



/** @type {(node: SyntaxNode, state: any, label: string) => void} */
export function printNode(node, state, label = "") {
  console.error(humanFormatNode(node, state, label))
}



/** @type {(node: SyntaxNode, state: any, label: string) => void} */
export function exitNode(node, state, label = "") {
  printNode(node, state, label)
  process.exit()
}
