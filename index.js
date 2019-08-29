function init_cata(schema, node, fgen) {
  let Id = schema({
    I: (ast) => ast,
    K: (v) => A => v,
    Y: (fn) => A => v => fn(A => v)(A)
  });
  let cata = {};
  for(let key of Object.keys(Id)) {
    cata[key] = (...args) => {
      let gen = fgen();
      return A => A[key](gen, ...args.map((arg, ii) => Id[key][ii](arg)(A)))
    }
  }
  return node(cata);
}

function step_cata(schema, node) {
  let pairc = {};
  let reader = null;
  let done = false;
  for(let key of Object.keys(schema({I: null, K: null, Y: null}))) {
    pairc[key] = ({gen,last}, ...args) => {
      let asts = schema({
        I: ({ast}) => ast,
        K: (v) => A => v,
        Y: () => A => { throw "empty function" }
      })[key].map((sch,ii) => sch(args[ii]));

      let out, nextgen = {gen};
      if(last.done) {
        done = true;
        out = last.value;
      } else {
        let cata = last.value.cata;
        if(!reader && ('seed' in last.value)) reader = {seed: last.value.seed};
        
        let outs = schema({
          I: (ii, {out}) => out,
          K: (ii, k) => k,
          Y: (ii, fn) => out_v => {
            let _v = null;
            let {ast,out} = fn({ast: A => _v, out: out_v});
            asts[ ii ] = A => v => {
              _v = v;
              return ast(A);
            };
            return out;
          }
        })[key].map((sch,ii) => sch(ii, args[ii]));

        let cata_out = cata[key](...outs);
        if(reader) {
          out = (...args) => {
            let ret = cata_out(...args);
            nextgen.last = gen.next(ret);
            return ret;
          }
        } else {
          out = cata_out;
          nextgen.last = gen.next(out);
        }
      }
      return { out, ast: A => A[key](nextgen, ...asts.map(ast => ast(A))) };
    }
  }
  let {out, ast} = node(pairc);
  if(reader) out = out(reader.seed);
  return {out, done, ast};
}

function run(fgen, schema, node) {
  let ast = init_cata(schema, node, () => {
    let gen = fgen();
    let last = gen.next();
    return {gen, last};
  });
  while(true) {
    let next = step_cata(schema, ast);
    if(next.done) return next.out;
    ast = next.ast;
  }
}

module.exports = { run };
