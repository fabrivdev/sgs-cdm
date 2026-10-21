/** Authored recipe metadata is not a claim of semantic or visual acceptance. */
import { recipes as sereno } from '../catalog/groups/sereno.mjs';
import { recipes as contento } from '../catalog/groups/contento.mjs';
import { recipes as atento } from '../catalog/groups/atento.mjs';
import { recipes as explicativo } from '../catalog/groups/explicativo.mjs';
import { recipes as alivio } from '../catalog/groups/alivio.mjs';
import { recipes as personalidad } from '../catalog/groups/personalidad.mjs';
import { recipes as preocupado } from '../catalog/groups/preocupado.mjs';
import { recipes as pensativo } from '../catalog/groups/pensativo.mjs';
import { recipes as sorprendido } from '../catalog/groups/sorprendido.mjs';
export const recipes = Object.freeze([...sereno, ...contento, ...atento, ...preocupado, ...pensativo, ...sorprendido, ...explicativo, ...alivio, ...personalidad]);
