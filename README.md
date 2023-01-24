Church Cat: Recursion schemes over church-encoded data
======================================================

Church cat solves a problem that often comes up in language tooling like
parsers and compilers. Given a tree of data, e.g. an abstract syntax tree or
context-free grammar, we want to compute several values at each node. These
values might depend on each other and should not be recomputed.

There are various ways to approach the problem: adding extra data to each node
that is filled in by passes over the tree (downsides: the dependency between
different pieces of data is implicit). Attribute grammars. Or recursion schemes
like catamorphisms. This library is based on recursion schemes, although it
plays much looser with them than what you'd find in Haskell.

~~~{.javasript}
const { I, K, cata, constructors } = require("church-cat");
// declare a schema using I and K. 
// I means a recursive copy of the top-level structure. 
// K means any other type.
const treeSchema = {
    branch: [I, I],
    tip: [K]
};

let { branch: Branch, tip: Tip } = constructors(treeSchema);
let exampleTree = Branch(
    Branch(tip(1), tip(2)), 
    tip(3));

// the return value of the constructors will be a church-encoded ADT, with a link to the associated schema.
// you can pattern match on the ADT simply by calling it with an object literal.
exampleTree({
    branch: (l,r) => console.log("example tree is a branch"), 
    tip: (n) => console.log("example tree is a tip")
});

// you declare a catamorphism by passing in a top-level ADT, and an object literal with reduction functions.
let heightOf = cata(exampleTree, {
    branch: (l,r) => 1 + Math.max(l, r),
    tip: (n) => 1
});

// after declaring a catamorphism, you can call it on any child of the ADT. 
// The catamorphism will only run once, memoizing its results.
heightOf(exampleTree); // 3
exampleTree({branch: (l,r) => [heightOf(l), heightOf(r)]}); // [2, 1]

// catamorphisms can also be declared with a seed argument in the third
// position. If there is a seed argument, then it will be passed down through
// the tree of catamorphism values.

// Important: Every reduction function must call all its children at least once.

// this rather useless catamorphism will find an array of parent heights, e.g. [3,2,1] for a tip at depth 3.
let parentHeights = cata(exampleTree, {
    branch: function(l,r) { 
        return parents => {
            // `this` inside a catamorphism is the corresponding ADT. Use `this` to call other catamorphisms.
            let myHeight = heightOf(this);
            // both children, l and r, must be called
            l([...parents, myHeight]); 
            r([...parents, myHeight]); 
            return parents
        }
    },
    tip: (n) => parents => parents
}, []);
~~~
