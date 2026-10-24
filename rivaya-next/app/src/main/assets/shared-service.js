(function(root){
  'use strict';
  class SharedGoals{
    constructor(accounts){this.accounts=accounts;this.cache=[];this.owner=null}
    async action(operation,args={}){
      const owner=this.accounts.owner;if(!owner)throw Error('authentication_required');
      const result=await this.accounts.transport.request(owner,'rpc/rivaya_shared',{operation,args});
      if(this.accounts.owner!==owner)throw Error('cancelled');
      if(operation==='list'){if(!Array.isArray(result))throw Error('invalid_response');this.cache=result;this.owner=owner}
      return result;
    }
    list(){return this.action('list')}
    create(title,name){return this.action('create',{title,name})}
    invite(goal_id){return this.action('invite',{goal_id})}
    join(token,name){return this.action('join',{token:token.trim().toLowerCase(),name})}
    add(goal_id,title,assigned_to,deadline){return this.action('add_step',{goal_id,title,assigned_to,deadline})}
    complete(goal_id,step){return this.action('set_step',{goal_id,step_id:step.id,expected_revision:step.revision,done:!step.done})}
    react(goal_id,reaction){return this.action('react',{goal_id,reaction})}
    leave(goal_id){return this.action('leave',{goal_id})}
    remove(goal_id){return this.action('delete',{goal_id})}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={SharedGoals};root.RivayaSharedModule={SharedGoals};
})(typeof globalThis!=='undefined'?globalThis:this);
