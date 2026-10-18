'use strict';
const c=require('../../scripts/uv_core.cjs');
// Load only inside the installed Windows computer-use node_repl session.
module.exports=function skyProvider(sky) {
  const observed=new Map();
  async function unique(window) {
    const matches=(await sky.list_windows()).filter(w=>w.id===window.id&&w.app===window.app);
    if(matches.length!==1)throw Error('GUI_WINDOW_NOT_UNIQUE');return matches[0];
  }
  return {
    async read(window) {
      const target=await unique(window);
      const state=await sky.get_window_state({window:target,include_screenshot:false,include_text:true});
      const tree=state.accessibility?.tree;
      if(!tree)throw Error('GUI_ACCESSIBILITY_UNAVAILABLE_USE_OBSERVED_MANUAL_FALLBACK');
      observed.set(target.id,{window:state.window,tree,timestamp:c.now()});
      return {window:state.window,tree,treeHash:c.hash(tree),timestamp:c.now()};
    },
    async click(window,index) {
      const state=observed.get(window.id);observed.delete(window.id);
      if(!state||Date.now()-Date.parse(state.timestamp)>15000)throw Error('GUI_REOBSERVE_REQUIRED');
      await sky.click({window:state.window,element_index:index});
    },
    async launch(exe) {await sky.launch_app({app:exe});return {windows:await sky.list_windows(),launchAcceptance:'requires_observation'};}
  };
};
