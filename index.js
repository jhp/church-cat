/*
    church-cat: a library for catamorphisms in javascript

    Copyright (C) 2019  Jason Priestley

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

function cata(fns) {
    let _fns = {}
    for(let key of Object.keys(fns)) {
        _fns[ key ] = (gen, ...outs) => {
            let out = fns[ key ](...outs)
            return {out, fgen: () => ({gen, gv: gen.next( out )})}
        }
    }
    return { fns: _fns }
}

function readCata(fns, seed) {
    let _fns = {}
    for(let key of Object.keys(fns)) {
        _fns[ key ] = (gen, ...outs) => {
            let _out = fns[ key ](...outs)
            let _ret
            let out = (r) => {
                _ret = _out(r)
                return _ret
            }
            return {out, fgen: () => ({gen, gv: gen.next(_ret)})}
        }
    }
    return { fns: _fns, seed }
}

function stateCata(fns, seed) {
    let _fns = {}
    for(let key of Object.keys(fns)) {
        _fns[ key ] = (gen, ...outs) => {
            let _out = fns[ key ](...outs)
            let state, value
            let out = (s) => {
                ({state, value} = _out(s))
                return {state, value}
            }
            return {out, fgen: () => ({gen, gv: gen.next(value)})}
        }
    }
    return { fns: _fns, seed }
}

function run(fgen, g, ast) {
  let g_args = g({
    I: (arg,A) => arg(A),
    K: (arg,A) => arg
  })
  let add_gen = Object.keys(g_args).reduce(
    (obj, name) => ({...obj, [name]: (...args) => {
      let gen = fgen()
      let gv = gen.next()
      return A => A[name](() => ({gen,gv}), ...args.map((arg,ii) => g_args[name][ii](arg, A)))
    }}), {})
  ast = ast(add_gen)

  while(true) {
    let g_args = g({
      I: ({out,ast}) => ({out,ast}),
      K: (v) => ({out:v,ast:A => v})
    })
    let _seed, hasSeed = false
    let out
    ({out, ast} = ast(Object.keys(g_args).reduce(
      (obj, name) => ({...obj, [name]: (fgen, ...args) => {
        let {gen,gv} = fgen()
        if(gv.done) {
          return {out: gv.value}
        }
        let fns = gv.value.fns
        if(!hasSeed && 'seed' in gv.value) {
          hasSeed = true
          _seed = gv.value.seed
        }
        let outs = [], asts = []
        args.map((arg,ii) => {
          let {out,ast} = g_args[name][ii]( arg )
          outs.push(out)
          asts.push(ast)
        })
        let {fgen: _fgen, out} = fns[ name ](gen, ...outs)
        return {
          out: out,
          ast: A => A[ name ](_fgen, ...asts.map(ast => ast(A)))
        }
      }}), {})))
    if(hasSeed) {
      out = out(_seed)
    }
    if(!ast) {
      return out
    }
  }
}

module.exports = { cata, readCata, stateCata, run }

let tree_g = ({I,K}) => ({
  branch: [I,I],
  leaf: [K]
})

let tree_ast = ({branch, leaf}) => branch(branch(leaf(1), leaf(2)), leaf(3));


console.log(
  run(function*() {
    let total = yield cata({
      branch: (l,r) => l+r,
      leaf: n => n 
    })
    let depth = yield readCata({
      branch: (l,r) => d => (l(d+1), r(d+1), d),
      leaf: (n) => d => d
    }, 0)
    let depthtree = yield cata({
      leaf: n => depth,
      branch: (l,r) => `(${l} ${r})`
    })
    return {total, depth, depthtree};
  }, tree_g, tree_ast)
);

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
  }, 1);
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
      return env;
    }
  }, {});
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
  });
}

let ops = run(function*() {
  let num = yield* numberNode();
  let env = yield* getEnv(num);
  return yield* concatOps(env, num);
}, ast_dec, ast);

console.log(ops);
