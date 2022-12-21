{ pkgs ? import <nixpkgs> {} }:

with pkgs;

# node-tree-sitter requires node 16
# https://github.com/tree-sitter/node-tree-sitter/issues/106

let
#_nodejs = nodejs-19_x; # error
#_nodejs = nodejs-18_x; # error
#_nodejs = nodejs-17_x; # not in nixpkgs
_nodejs = nodejs-16_x;
in

mkShell {

buildInputs = [
gnumake # make
gcc
python3 # for node-gyp
tree-sitter
_nodejs
_nodejs.pkgs.node-gyp
];

}
