/** Scene-local gestures: one small greeting/invitation, not sped-up repeated gestures.
 * The shared registry and other Campi scenes remain unchanged. */
export function welcomeRecipes(recipes) {
 return recipes.map(recipe=>{
  if(recipe.id==='personalidad-02')return {...recipe,duration:1.1,tracks:{
   'body.yaw':[[0,0],[.24,-.07],[.56,0],[1,0]],
   'arm.L.palmOut':[[0,0],[.38,.55],[.65,.55],[1,0]],
   'hand.L.open':[[0,0],[.3,.8],[.68,.8],[1,0]],
   'hand.L.roll':[[0,0],[.38,-.09],[.62,.09],[.85,0],[1,0]],
   'face.smile':[[0,0],[.3,.04],[.75,.04],[1,0]]
  },events:[{at:.38,type:'left_hand_wave_raised'},{at:.62,type:'wave_first_return'},{at:.85,type:'wave_finished'}]};
  if(recipe.id==='personalidad-12')return {...recipe,duration:1.2,tracks:{
   'arm.R.palmUp':[[0,0],[.25,.45],[.55,.45],[1,0]],
   'arm.R.invite':[[0,0],[.25,0],[.55,.35],[1,0]],
   'hand.R.open':[[0,0],[.22,.65],[.6,.65],[1,0]],
   'head.pitch':[[0,0],[.35,.02],[.65,.02],[1,0]]
  },events:[{at:.22,type:'inviting_palm_open'},{at:.55,type:'first_inviting_sweep'}]};
  return recipe;
 });
}
