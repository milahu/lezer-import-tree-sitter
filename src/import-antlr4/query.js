/** @typedef {import("@lezer/common").SyntaxNode} SyntaxNode */
/** @typedef {import("@lezer/common").Tree} Tree */



export function nodeType(node, state) {
  //console.log("nodeType: node:", node)
  let type = node.constructor.name
  return type
}


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
  return node; // noop
  //checkInfiniteLoop();
  while (
    node && (
      //node.type.name == 'Comment' ||
      //node.type.name == 'CommentBlock'
      // not sure what exactly "c" is, but c-nodes have no source locations
      // -> node.start == undefined
      // so we cant use nodeText(node, state)
      nodeType(node) == "c"
    )
  ) {
    node = nextSibling(node);
  }
  return node;
}



/** @type {function(SyntaxNode): SyntaxNode|null} */
export function firstChild(node) {
  if (!node) return null;
  const startNode = node
  //if (!(node = node.firstChild)) {
  if (!node.children || !node.children[0]) {
    //console.log(`firstChild: node.firstChild is empty`);
    //console.log(`firstChild(${nodeType(startNode)} ${startNode.start?.start}-${startNode.stop?.stop}) -> null`);
    return null;
  }
  node = node.children[0]
  if (!(node = skipComments(node))) {
    //console.log(`firstChild: skipComments failed`);
    //console.log(`firstChild(${nodeType(startNode)} ${startNode.start?.start}-${startNode.stop?.stop}) -> null (skipComments)`);
    return null;
  }
  //console.log(`firstChild(${nodeType(startNode)} ${startNode.start?.start}-${startNode.stop?.stop}) -> ${node.start?.start}-${node.stop?.stop}`);
  return node;
}



/** @type {function(SyntaxNode): SyntaxNode|null} */
export function nextSibling(node) {
  if (!node) return null;
  const startNode = node
  const parent = node.parentCtx
  //if (!parent) return null;
  const index = parent.children.indexOf(node)
  const nextIndex = index + 1
  //if (!(node = node.nextSibling)) {
  if (!(node = parent.children[nextIndex])) {
    //console.log(`nextSibling: node.nextSibling is empty`);
    //console.log(`nextSibling(${nodeType(startNode)} ${startNode.start?.start}-${startNode.stop?.stop}) -> null`);
    return null;
  }
  if (!(node = skipComments(node))) {
    //console.log(`nextSibling: skipComments failed`);
    //console.log(`nextSibling(${nodeType(startNode)} ${startNode.start?.start}-${startNode.stop?.stop}) -> null (skipComments)`);
    return null;
  }
  //console.log(`nextSibling:`, node);
  //console.log(`nextSibling(${nodeType(startNode)} ${startNode.start?.start}-${startNode.stop?.stop}) -> ${node.start?.start}-${node.stop?.stop}`);
  return node;
}



/** @type {function(SyntaxNode): SyntaxNode} */
export function getParent(node) {
  if (!node) return null;
  const startNode = node
  //if (!node.parentCtx || !node.parentCtx.start) {
  if (!node.parentCtx.start) {
    // node is root node
    //console.log(`getParent(${nodeType(startNode)} ${startNode.start?.start}-${startNode.stop?.stop}) -> null`);
    return null
  }
  node = node.parentCtx
  //console.log(`getParent(${nodeType(startNode)} ${startNode.start?.start}-${startNode.stop?.stop}) -> ${node.start?.start}-${node.stop?.stop}`);
  return node; // TODO?
}



/** @type {function(SyntaxNode, State): string} */
export function nodeText(node, state) {
  return node.getText()
}



// based on stringifyTree
/**
  @param {SyntaxNode|Tree} parentNode
  @param {(node: SyntaxNode) => boolean} condition
  @return {SyntaxNode|undefined}
*/
export function findNode(parentNode, condition) {
  /*
  if ("topNode" in parentNode) {
    // parentNode is a Tree
    parentNode = parentNode.topNode
  }
  */
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
  /*
  if (parentNode.topNode) {
    // parentNode is a Tree
    parentNode = parentNode.topNode
  }
  */
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
  /*
  if (parentNode.topNode) {
    // parentNode is a Tree
    parentNode = parentNode.topNode
  }
  */
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
  /*
  if (parentNode.topNode) {
    // parentNode is a Tree
    parentNode = parentNode.topNode
  }
  */
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
