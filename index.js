
let I = ({I, K, L}) => I();

let K = ({I, K, L}) => K();

let L = (S) => ({I,K,L}) => L(S);

let [getSchema, tagWithSchema] = (function(schema_tag) {
    return [obj => schema_tag.get(obj), (schema, val) => { schema_tag.set(val, schema); return val; }];
})(new WeakMap());

function constructors( schema ) {
    return Object.fromEntries(
        Object.keys(schema).map((name) => ([name, (...args) => tagWithSchema(schema, (ctors) => ctors[name](...args))]))
    );
}

function schemaAction(cata, child, schema) {
    return schema({
        I: () => child(cata(child)),
        K: () => child,
        L: (S) => child.map(ch => schemaAction(cata, ch, S))
    });
}

let cata = (function(cata_map) {
    return function (...args) {
        let [cataF, seed] = args;
        let hasSeed = args.length > 1;
        return (obj, child) => objF(cataF, hasSeed, seed, obj, child || obj);
    }
    function objF(cataF, hasSeed, seed, obj, child) {
        if(!cata_map.has(obj))
            cata_map.set(obj, new WeakMap());
        if(!getSchema(obj)) 
            throw new Error("No schema for obj");
        let schema = getSchema(obj);
        if(!cata_map.get(obj).has(cataF)) {
            let values = new Map();
            cata_map.get(obj).set(cataF, {running: true, values});
            let cataFObj = typeof cataF === 'function' ? cataF(obj) : cataF;
            let xformed_cata = (obj) => Object.fromEntries(
                Object.entries(cataFObj).map(([name, fn]) => ([name, (...children) => {
                   let output = fn.apply(obj, children.map((child, ii) => schemaAction(xformed_cata, child, schema[name][ii])));
                   if(hasSeed) {
                       return (...args) => {
                           let out = output(...args);
                           values.set(obj, out);
                           return out;
                       }
                   } else {
                       values.set(obj, output);
                       return output;
                   }
               }]))
            );
            let top = obj(xformed_cata(obj));
            if(hasSeed) { top(seed) };
            cata_map.get(obj).get(cataF).running = false;
        }
        let {running, values} = cata_map.get(obj).get(cataF);
        if(running) throw new Error("Circular call");
        if(!values.has(child)) throw new Error("Child not available", {cause: child});
        return values.get(child);
    }
})(new WeakMap());

module.exports = { I, K, L, constructors, cata, tagWithSchema, getSchema };
