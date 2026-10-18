'use strict';
const fs=require('node:fs');
const path=require('node:path');
const c=require('../../scripts/uv_core.cjs');
const h=require('../../scripts/uv_hybrid.cjs');
const {adapter}=require('../base.cjs');
module.exports=adapter('IKapCViewer',{
  read_capture:{level:'READ_ONLY',validate:args=>{if(!args.file||!args.source)throw Error('CAPTURE_SOURCE_REQUIRED');},execute:async(args,ctx)=>{
    const image=await h.inspectFile(args.file);
    if(!['PNG','JPEG','BMP','TIFF'].includes(image.kind))throw Error('CAPTURE_IMAGE_FORMAT_REQUIRED');
    const result={image,source:args.source,status:'existing_image_read',analysis:args.analysis||null,cameraConnection:'unknown',calibration:'unverified'};
    c.updateJob(ctx.dir,j=>{j.vision=result;});return result;
  },verification:'LOCAL_TEST'}
},async registry=>{
  const app=registry.registry.IKapCViewer||{status:'unavailable'}, root=app.selected?.workingDirectory;
  const sdk=root?fs.readdirSync(root).filter(n=>/IKap.*\.(dll|h)$/i.test(n)).map(n=>path.join(root,n)):[];
  return {...app,sdkFiles:sdk,acquisition:'REQUIRES_REAL_MACHINE_TEST',parameterWrites:'disabled'};
});
