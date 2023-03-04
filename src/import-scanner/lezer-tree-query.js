/** @typedef {import("@lezer/common").SyntaxNode} SyntaxNode */
/** @typedef {import("@lezer/common").Tree} Tree */



/** @type {(node: SyntaxNode, state: any, label: string) => void} */
export function printNode(node, state, env, options = {}) {
  if (!options) options = {};
  const label = options.label || '';
  let extraDepth = 0;
  if (label) {
    //console.log(label);
    extraDepth = 1; // indent the node
  }
  // note: this will print a trailing newline
  //console.log(node.toString(0, 5, "  ", extraDepth));
  const nodeSource = state.source.slice(node.from, node.to)
  console.error((label ? (label + ': ') : '') + `${node.type.name}: ${nodeSource}`);
}



/** @type {function(SyntaxNode): SyntaxNode|null} */
function skipComments(node) {
  //checkInfiniteLoop();
  while (
    node && (
      node.type.name == 'Comment' ||
      node.type.name == 'CommentBlock'
    )
  ) {
    node = node.nextSibling;
  }
  return node;
}



/** @type {function(SyntaxNode): SyntaxNode|null} */
export function firstChild(node) {
  if (!node) return null;
  if (!(node = node.firstChild)) {
    //console.log(`firstChild: node.firstChild is empty`);
    return null;
  }
  if (!(node = skipComments(node))) {
    //console.log(`firstChild: skipComments failed`);
    return null;
  }
  return node;
}



/** @type {function(SyntaxNode): SyntaxNode|null} */
export function nextSibling(node) {
  if (!node) return null;
  if (!(node = node.nextSibling)) {
    //console.log(`nextSibling: node.nextSibling is empty`);
    return null;
  }
  if (!(node = skipComments(node))) {
    //console.log(`nextSibling: skipComments failed`);
    return null;
  }
  return node;
}




/** @type {function(SyntaxNode): SyntaxNode} */
export function getParent(node) {
  if (!node) return null;
  return node.parent; // TODO?
}




/** @type {function(SyntaxNode, State): string} */
export function nodeText(node, state) {
  // source = full source code of the Nix file
  // text = source code of this node
  return state.source.slice(node.from, node.to);
}



// based on stringifyTree
/**
  @param {SyntaxNode|Tree} parentNode
  @param {(node: SyntaxNode) => boolean} condition
  @return {SyntaxNode|undefined}
*/
export function findNode(parentNode, condition) {
  if ("topNode" in parentNode) {
    // parentNode is a Tree
    parentNode = parentNode.topNode
  }
  /*
  const cursor = tree.cursor()
  if (!cursor) {
    throw new Error("no cursor")
  }
  */
  let node = parentNode
  let nextNode
  let depth = 0;

  while (true) {
    // NLR: Node, Left, Right
    // Node
    if (condition(node)) {
      return node
    }
    // Left
    nextNode = firstChild(node)
    if (nextNode) {
      // moved down
      depth++;
      node = nextNode
      continue;
    }
    // Right
    if (depth > 0) {
      nextNode = nextSibling(node)
      if (nextNode) {
        // moved right
        node = nextNode
        continue;
      }
    }
    let continueMainLoop = false;
    nextNode = getParent(node)
    while (nextNode) {
      // moved up
      node = nextNode
      depth--;
      if (depth <= 0) {
        return
      }
      nextNode = nextSibling(node)
      if (nextNode) {
        // moved up + right
        node = nextNode
        continueMainLoop = true;
        break
      }
      nextNode = getParent(node)
    }
    if (continueMainLoop) continue;
    break;
  }
}



// based on findNode
/**
  @param {SyntaxNode|Tree} parentNode
  @param {(node: SyntaxNode) => boolean} condition
  @return {SyntaxNode[]}
*/
export function filterNodes(parentNode, condition) {
  const result = []
  if (parentNode.topNode) {
    // parentNode is a Tree
    parentNode = parentNode.topNode
  }
  /*
  const cursor = tree.cursor()
  if (!cursor) {
    throw new Error("no cursor")
  }
  */
  let node = parentNode
  let nextNode
  let depth = 0;

  while (true) {
    // NLR: Node, Left, Right
    // Node
    if (condition(node)) {
      //return node
      result.push(node)
    }
    // Left
    nextNode = firstChild(node)
    if (nextNode) {
      // moved down
      depth++;
      node = nextNode
      continue;
    }
    // Right
    if (depth > 0) {
      nextNode = nextSibling(node)
      if (nextNode) {
        // moved right
        node = nextNode
        continue;
      }
    }
    let continueMainLoop = false;
    nextNode = getParent(node)
    while (nextNode) {
      // moved up
      node = nextNode
      depth--;
      if (depth <= 0) {
        return result
      }
      nextNode = nextSibling(node)
      if (nextNode) {
        // moved up + right
        node = nextNode
        continueMainLoop = true;
        break
      }
      nextNode = getParent(node)
    }
    if (continueMainLoop) continue;
    break;
  }
  return result
}



// based on filterNodes
/**
  @param {SyntaxNode|Tree} parentNode
  @param {(node: SyntaxNode) => boolean} condition
  @return {SyntaxNode[]}
*/
export function filterChildNodes(parentNode, condition) {
  const result = []
  if (parentNode.topNode) {
    // parentNode is a Tree
    parentNode = parentNode.topNode
  }
  let node = parentNode
  node = firstChild(node) // Left
  while (node) {
    if (condition(node)) {
      result.push(node)
    }
    node = nextSibling(node)
  }
  return result
}



// based on filterNodes
/**
  @template T
  @param {SyntaxNode|Tree} parentNode
  @param {(acc: T, node: SyntaxNode) => T} reducer
  @param {T} initValue
  @return {T}
*/
export function reduceNodes(parentNode, reducer, initValue) {
  let acc = initValue
  if (parentNode.topNode) {
    // parentNode is a Tree
    parentNode = parentNode.topNode
  }
  /*
  const cursor = tree.cursor()
  if (!cursor) {
    throw new Error("no cursor")
  }
  */
  let node = parentNode
  let nextNode
  let depth = 0;

  while (true) {
    // NLR: Node, Left, Right
    // Node
    acc = reducer(acc, node)
    // Left
    nextNode = firstChild(node)
    if (nextNode) {
      // moved down
      depth++;
      node = nextNode
      continue;
    }
    // Right
    if (depth > 0) {
      nextNode = nextSibling(node)
      if (nextNode) {
        // moved right
        node = nextNode
        continue;
      }
    }
    let continueMainLoop = false;
    nextNode = getParent(node)
    while (nextNode) {
      // moved up
      node = nextNode
      depth--;
      if (depth <= 0) {
        return acc
      }
      nextNode = nextSibling(node)
      if (nextNode) {
        // moved up + right
        node = nextNode
        continueMainLoop = true;
        break
      }
      nextNode = getParent(node)
    }
    if (continueMainLoop) continue;
    break;
  }
  return acc
}
