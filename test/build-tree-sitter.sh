#! /usr/bin/env bash

set -e
#set -x

# check dependencies
tree-sitter --version
node-gyp --version
gcc --version
make --version

system_tree_sitter=$(which tree-sitter)

# chdir to project root
cd "$(dirname "$0")"/..

# loop test cases
for dir in $(find test/cases/ -mindepth 1 -maxdepth 1 -type d)
do

echo
echo "test case: $dir"
name=$(basename "$dir")

pushd "$dir/tree-sitter-$name/"

f=build/Release/tree_sitter_${name}_binding.node
if [ -e $f ]
then
  echo "skipping build because bindings exist: $dir/tree-sitter-$name/$f"
  popd
  continue
fi

if ! [ -d node_modules ]
then
  echo installing node_modules ...
  pnpm install --ignore-scripts
  echo installing node_modules done:
  ls -A node_modules
  # TODO replace tree-sitter binary
  f=node_modules/tree-sitter-cli/tree-sitter
  rm -v $f || true
  ln -v -s $system_tree_sitter $f
fi

# generate src/parser.c and binding.gyp
tree-sitter generate

# generate build/
node-gyp configure

build_script=$(cat package.json | jq -r .scripts.build)
if [[ "$build_script" != "null" ]]
then
  npm run build
else
  (
    set -x
    node-gyp build
  )
fi

echo "done bindings: $dir/tree-sitter-$name/$f"

stat "$f"

popd

done
