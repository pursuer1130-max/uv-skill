#target photoshop
(function () {
    var cfg=UV_PREPRESS_CONFIG, original=app.documents.length?app.activeDocument:null;
    var units=app.preferences.rulerUnits, dialogs=app.displayDialogs, doc=null, opened=null, ownsSource=false;
    var root=new File($.fileName).parent, operations=[], result, oldExportConfig=$.global.UV_JOB_CONFIG;
    function color(hex) {var c=new SolidColor();c.rgb.hexValue=hex;return c;}
    function rectangle(x,y,w,h,hex,name) {
        doc.artLayers.add().name=name;
        doc.selection.select([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
        doc.selection.fill(color(hex));doc.selection.deselect();
    }
    function text(value,x,y,size,hex) {
        var t=doc.artLayers.add();t.kind=LayerKind.TEXT;t.name=value;
        t.textItem.contents=value;t.textItem.font='ArialMT';t.textItem.size=UnitValue(size,'pt');
        t.textItem.position=[x,y];t.textItem.color=color(hex);
    }
    function mask(name,inset,spot) {
        for(var i=0;i<doc.channels.length;i++) if(doc.channels[i].name===name) throw Error('Duplicate channel name: '+name);
        var channel=doc.channels.add();channel.name=name;
        doc.activeChannels=[channel];doc.selection.selectAll();doc.selection.fill(color('FFFFFF'));doc.selection.deselect();
        var w=doc.width.as('px'),h=doc.height.as('px');
        doc.selection.select(spot?[[30,145],[354,145],[354,408],[30,408]]:[[inset,inset],[w-inset,inset],[w-inset,h-inset],[inset,h-inset]]);
        doc.selection.fill(color('000000'));doc.selection.deselect();
        if(spot) {channel.kind=ChannelType.SPOTCOLOR;channel.color=color('FFFFFF');channel.opacity=100;}
        doc.activeChannels=doc.componentChannels;
        operations.push((spot?'spot channel ':'alpha mask ')+name+': black=coverage demo; RIP mapping unverified');
    }
    function encode(v) {
        if(v===null)return 'null';
        if(typeof v==='string')return '"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';
        if(typeof v==='number'||typeof v==='boolean')return String(v);
        var rows=[],k;if(v instanceof Array){for(k=0;k<v.length;k++)rows.push(encode(v[k]));return '['+rows.join(',')+']';}
        for(k in v)if(v.hasOwnProperty(k))rows.push(encode(k)+':'+encode(v[k]));return '{'+rows.join(',')+'}';
    }
    try {
        app.displayDialogs=DialogModes.NO;app.preferences.rulerUnits=Units.PIXELS;
        if(cfg.demo===true) {
            doc=app.documents.add(720,480,cfg.dpi||72,'UV learned low DPI',NewDocumentMode.RGB,DocumentFill.WHITE);
            rectangle(0,0,720,480,'F4F6F6','Paper');
            rectangle(0,0,720,116,'183A35','Header');
            text('UV / FACTORY STUDY',28,49,28,'FFFFFF');
            text(String(cfg.dpi||72)+' PPI   /   COLOR'+(cfg.white?' + WHITE':'')+(cfg.varnish?' + VARNISH':''),30,82,12,'92D5B4');
            var colors=['00B7C9','DD367D','EFCE2D','242B2D','E8664F','419D70'];
            var names=['C','M','Y','K','RED','GREEN'];
            for(var i=0;i<colors.length;i++) {rectangle(30+i*112,145,101,148,colors[i],'Color '+names[i]);text(names[i],37+i*112,319,12,'183A35');}
            rectangle(30,350,324,58,'FFFFFF','White demo');rectangle(366,350,324,58,'DCE9E4','Varnish demo');
            var whiteLabel='NO WHITE CHANNEL',varnishLabel='NO VARNISH CHANNEL';
            if(cfg.white)whiteLabel='w  /  WHITE MASK';
            if(cfg.spotWhiteName) {whiteLabel='WHITE SPOT TEST';varnishLabel='COLOR ONLY CONTROL';}
            if(cfg.varnish)varnishLabel='v  /  VARNISH MASK';
            text(whiteLabel,43,385,16,'183A35');text(varnishLabel,379,385,16,'183A35');
            text('720 x 480 px  |  LOW-RES PREPRESS SAMPLE',30,443,12,'183A35');
            text('Channel names observed in factory files. Mapping requires RIP verification.',30,465,9,'526560');
            operations.push('create low-resolution software sample');
        } else {
            var existingInput=false;
            for(var k=0;k<app.documents.length;k++)try{if(app.documents[k].fullName.fsName.toLowerCase()===new File(cfg.input).fsName.toLowerCase())existingInput=true;}catch(e){}
            opened=app.open(new File(cfg.input));doc=opened.duplicate('UV working copy',false);
            ownsSource=!existingInput;
            operations.push('open source and duplicate');
        }
        if(cfg.resize) {doc.resizeImage(UnitValue(cfg.resize[0],'px'),UnitValue(cfg.resize[1],'px'),cfg.dpi||doc.resolution,ResampleMethod.BICUBIC);operations.push('resize pixels');}
        else if(cfg.dpi) {doc.resizeImage(undefined,undefined,cfg.dpi,ResampleMethod.NONE);operations.push('set DPI without resampling');}
        if(cfg.canvas) {doc.resizeCanvas(UnitValue(cfg.canvas[0],'px'),UnitValue(cfg.canvas[1],'px'),AnchorPosition.MIDDLECENTER);operations.push('resize canvas');}
        if(cfg.colorMode==='RGB' && doc.mode!==DocumentMode.RGB) {doc.changeMode(ChangeMode.RGB);operations.push('convert RGB');}
        if(cfg.colorMode==='CMYK') {doc.convertProfile(cfg.profile,Intent.RELATIVECOLORIMETRIC,true,true);if(doc.mode!==DocumentMode.CMYK)throw Error('Profile did not produce CMYK');operations.push('convert profile '+cfg.profile);}
        if(cfg.white)mask(cfg.spotWhiteName||'w',20,!!cfg.spotWhiteName);
        if(cfg.varnish)mask('v',Math.round(Math.min(doc.width.as('px'),doc.height.as('px'))*0.25));
        var channels=[],layers=[];
        for(var n=0;n<doc.channels.length;n++)channels.push({name:doc.channels[n].name,kind:String(doc.channels[n].kind)});
        for(n=0;n<doc.layers.length;n++)layers.push(doc.layers[n].name);
        result={version:app.version,dimensions:{widthPx:doc.width.as('px'),heightPx:doc.height.as('px'),widthMm:doc.width.as('px')/doc.resolution*25.4,heightMm:doc.height.as('px')/doc.resolution*25.4},dpi:doc.resolution,colorMode:String(doc.mode),profile:doc.colorProfileName,channels:channels,layers:layers,operations:operations,physicalPrint:'unverified'};
        $.global.UV_JOB_CONFIG={outputDir:cfg.outputDir,demo:false};
        $.evalFile(new File(root.fsName+'/uv_photoshop_export.jsx'));
        var report=new File(cfg.metadataFile);report.encoding='UTF8';if(!report.open('w'))throw Error('Cannot write result');report.write(encode(result));report.close();
    } finally {
        if(doc)try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(e){}
        if(ownsSource&&opened)try{opened.close(SaveOptions.DONOTSAVECHANGES);}catch(e){}
        if(original)try{app.activeDocument=original;}catch(e){}
        $.global.UV_JOB_CONFIG=oldExportConfig;
        app.preferences.rulerUnits=units;app.displayDialogs=dialogs;
    }
}());
