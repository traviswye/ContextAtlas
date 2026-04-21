import { Calculator, greet } from "./sample.js";

const calc = new Calculator();
const sum = calc.add(1, 2);
console.log(greet(`sum=${sum}`));
