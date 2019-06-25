Church Cat: Use generator syntax to write catamorphisms over church-encoded data
====================================================================================

Preface: Vanilla Javascript already has support for ADTs
--------------------------------------------------------

There are a number of proposals, libraries and language extensions
that attempt to add ADTs (Abstract Data Types) and pattern matching to
javascript. However, vanilla javascript already has one way to
represent ADTs - via Church encoding.

For example, here is an encoding of a simple tree in javascript.

~~~{.javascript}
let t = ({branch, leaf}) => branch(branch(leaf(2), leaf(3)), leaf(1))
~~~

This encoding can be used directly to perform folds over the structure.

~~~{.javascript}
let sum = t({
  branch: (l,r) => l + r,
  leaf: (n) => n
})
~~~

This is a little different from the typical ADT structure used in
functional languages like ML, which is better represented by the
Scott encoding. Fortunately, translating between the two is
simple.

~~~{.javascript}
let scott = (tree) => tree({
    branch: (l,r) => ops => ops.branch(l, r),
    leaf: (n) => ops => ops.leaf(n)
})

let st = scott(tree)

// looks more like an ML/Haskell pattern match; the fold requires explicit recursion now
let sum = (function scott_sum(st) {
    return st({
        branch: (l,r) => scott_sum(l) + scott_sum(r),
        leaf: (n) => n
    })
})(st)
~~~

These techniques are not part of this library - they are just a
pattern of programming that is currently uncommon in javascript, but
supported by the language.

Church Cat
----------

To use `church-cat`, we have to write a little declaration for our
ADT. The declaration looks like this:

~~~{.javascript}
let t_dec = ({I,K}) => ({
    branch: [I,I],
    leaf: [K]
})
~~~

This shows that the two arguments to the `Branch` constructor are
recursive applications of the Tree functor - represented using `I` to
indicate the constant functor, based on standard combinator
symbols. And the one argument to `Leaf` is not a recursive application
of the functor, but some other type, i.e. a number - represented here
with the `K` constant combinator. A future release of this library
should add a `Y` combinator to the mix to allow fixpoint structures,
e.g. lambda terms :)

Our declaration finished, we can write some catamorphisms.

~~~{.javascript}
let {run, cata, readCata, stateCata} = require('church-cat')

let sum = run(function*() {
  return yield cata({
    branch: (l,r) => l + r,
    leaf: (n) => n
  })
}, t_dec, tree)
~~~

This is the same sum calculation as before. We can also pass an
argument down or thread a state value through the calculation. Next we
take the max depth by passing down the depth at each level, and count
the nodes by passing through a count to each node (either calculation
could be simpler but this shows the mechanics of the operations).

~~~{.javascript}
let max_depth = run(function*() {
  return yield readCata({
    branch: (l,r) => d => Math.max(l(d),r(d)),
    leaf: (n) => d => d
  }, 0)
}, t_dec, tree)

let node_count = run(function*() {
  return yield stateCata({
    branch: (l,r) => n => {
      let new_n = r(l(n).state).state
      return {state: new_n+1, value: new_n}
    )
    leaf: () => n => ({state: n+1, value: n})
  }, 0);
}, t_dec, tree)
~~~

For `readCata` and `stateCata`, the second argument provides an
initial value and should be a constant. It is necessary to call all
recursive values, i.e. `l` and `r` above, within the body of the
catamorphism.

What makes `church-cat` especially useful is that these operations can
be chained within the generator. For example, to find the sum of the
depths at each leaf:

~~~{.javascript}
let depth_sum = run(function*() {
  let depth = yield readCata({
    branch: (l,r) => d => (l(d),r(d),d),
    leaf: () => d => d
  }, 0)
  return yield cata({
    branch: (l,r) => l + r,
    leaf: () => depth
  })
}, t_dec, tree)
~~~

`church-cat` runs one copy of this generator at each node of the
ADT. Note that the order of operations must be the same in every case
(no `yield` statements inside `if` statements or loops). Of course one
also must take care if using shared state within the generator.

Compiling a Simple Expression
-----------------------------

This section will show a more realistic example of how this library
can be useful for compilers and similar projects. Suppose that we have
a simple expression language, which consists of numbers, "let"
expressions like `(let (var value) body)`, and the operators `+` and
`-`. For example, `(let (x 1) (let (y 2) (+ x y)))` would evaluate to
3.

We will transform this into a flat list of operations on virtual
registers, like `[r1=1, r2=2, r3=r1+r2]`. This
requires a few steps. First we give each AST node a number, using a
`stateCata`. Then we pass down an environment mapping each variable
name to a unique number (taken from the binding let node's state
number). Finally we use a catamorphism to paste together the
individual operations.

This is not too far from the kind of work that compiler writers do in
practice. The advantage of the `church-cat` approach is that each
"phase" can be written and understood separately, or put into a
function.

~~~{.javascript}
let ast_dec = ({K,I}) => ({
    Let: [K, I, I],
    Const: [K],
    Op: [K, I, I],
    Var: [K]
})

let ast = ({Let,Const,Op,Var}) => 
  Let('x', Const(1), Let('y', Const(2), Op('+', Var('x'), Var('y'))))

function* numberNode() {
  return yield stateCata({
    Const: () => n => ({state:n+1, value:n}),
    Var: () => n => ({state:n+1,value:n}),
    Op: (op,l,r) => n => {
      let new_n = r(l(n).state).state
      return {state: new_n+1, value:new_n}
    },
    Let: (name,l,r) => n => {
      let new_n = r(l(n).state).state
      return {state: new_n+1, value:new_n}
    }
  }, 1)
}

function* getEnv(num) {
  return yield readCata({
    Const: () => env => env,
    Var: () => env => env,
    Op: (op, l, r) => env => (l(env),r(env),env),
    Let: (name, l, r) => env => {
      let new_env = {...env, [name]: `r${num}`}
      l(new_env)
      r(new_env)
      return env
    }
  }, {})
}

function* concatOps(env, num) {
  return yield cata({
    Const: (n) => ({ops: [], ret: n.toString()}),
    Var: (name) => ({ops: [], ret: env[name]}),
    Op: (op, l, r) => ({
      ops: [...l.ops, ...r.ops, `r${num}=${l.ret}${op}${r.ret}`], 
      ret: `r${num}`
    }),
    Let: (name, l, r) => ({
      ops: [...l.ops, `r${num}=${l.ret}`, ...r.ops], 
      ret: r.ret
    })
  })
}

let ops = run(function*() {
  let num = yield* numberNode()
  let env = yield* getEnv(num)
  return yield* concatOps(env, num)
}, ast_dec, ast)
~~~

The result is `{ ops: [ 'r7=1', 'r6=2', 'r5=r7+r6' ], ret: 'r5' }`.


