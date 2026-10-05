'use strict';

// Bound work before recursive upstream walkers, including direct AST callers.
const MAX_DEPTH = 128;
const assertTree = ast => {
  const stack = [[ast, 0]];
  const seen = new Set();
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (!node || typeof node !== 'object') throw new TypeError('Expected an AST node');
    if (depth > MAX_DEPTH || seen.has(node) || seen.size >= 65536) {
      throw new SyntaxError('Brace AST exceeds safe traversal limits');
    }
    seen.add(node);
    if (node.nodes) {
      if (!Array.isArray(node.nodes) || node.nodes.length > 65536) throw new SyntaxError('Invalid brace AST children');
      if (stack.length + node.nodes.length > 65536) throw new SyntaxError('Brace AST exceeds safe traversal limits');
      for (const child of node.nodes) stack.push([child, depth + 1]);
    }
  }
};
module.exports = { MAX_DEPTH, assertTree };
