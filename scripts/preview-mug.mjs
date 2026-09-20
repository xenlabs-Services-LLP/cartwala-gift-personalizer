import http from "node:http";
import fs from "node:fs";

const base = "extensions/cartwala-personalizer/";
http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost:4178");
  if (url.pathname === "/style.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(fs.readFileSync(base + "assets/cartwala-personalizer.css"));
    return;
  }
  const model = ["white", "magic", "red", "love-handle"].includes(url.searchParams.get("model")) ? url.searchParams.get("model") : "magic";
  const source = fs.readFileSync(base + "assets/cartwala-personalizer.js", "utf8");
  const logic = source.slice(source.indexOf("  const createMugGeometry"), source.indexOf("  const initialize ="));
  const labels = JSON.parse(fs.readFileSync(base + "locales/en.default.json", "utf8")).mug_preview;
  let markup = fs.readFileSync(base + "blocks/personalizer.liquid", "utf8");
  markup = markup.slice(markup.indexOf('      <section class="cw-mug-preview'), markup.indexOf("    {% endif %}", markup.indexOf("</dialog>")));
  markup = markup.replace(/{% if mug_model == 'magic' %}([\s\S]*?){% endif %}/g, (_, content) => model === "magic" ? content : "");
  markup = markup.replace(/{{ 'mug_preview\.([^']+)' \| t(?: \| escape)? }}/g, (_, key) => labels[key]);
  markup = markup.replace(/{{ 'personalizer.close' \| t \| escape }}/g, "Close").replace(/{{ block.id }}/g, "test").replace(/{{ mug_model }}/g, model);
  response.setHeader("Content-Type", "text/html");
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Mug renderer test</title><style>body{font-family:Arial;margin:12px}nav{display:flex;gap:20px;margin:10px}.shopify-section{width:min(100%,${url.searchParams.has("mobile") ? "360" : "760"}px);margin:auto}.product__media{position:relative;padding-bottom:100%}.product__media img{width:100%}button{font:inherit}#status{display:block;padding:10px}select{margin:10px}</style></head><body><nav>${["white", "magic", "red", "love-handle"].map(m => `<a href="/?model=${m}${url.searchParams.has("mobile") ? "&mobile=1" : ""}">${m}</a>`).join("")}<a href="/?model=${model}&mobile=1">Mobile</a><a href="/?model=${model}&fallback=1">No WebGL</a></nav><main class="shopify-section"><div class="product__media"><img alt="Original product" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='silver'/%3E%3C/svg%3E"></div><div class="cw-personalizer" data-cw-personalizer data-cw-mug-model="${model}">${markup}</div><button id="save">Save new design</button><button id="black">Black design</button><button id="lose">Lose context</button><button id="restore">Restore context</button><label>Colour<select name="Colour"><option value="">Default</option><option>Red</option><option>Light green</option></select></label><output id="status"></output></main><script>
  ${url.searchParams.has("fallback") ? "const originalContext=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:originalContext.call(this,type,...args)};" : ""}
  ${logic}
  const root=document.querySelector('[data-cw-personalizer]');
  initializeMugPreview(root);
  let revision=0;
  function design(black=false){
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=350;
    const ctx=canvas.getContext('2d');ctx.fillStyle=black?'#000':'#ee436f';ctx.fillRect(0,0,900,350);
    ctx.fillStyle='#fff';ctx.font='bold 55px Arial';ctx.fillText('Dileep '+revision,40,190);
    ctx.fillRect(565,30,285,285);ctx.fillStyle='#128aa8';ctx.fillRect(575,40,265,265);
    ctx.fillStyle='#fed865';ctx.beginPath();ctx.arc(710,145,58,0,Math.PI*2);ctx.fill();ctx.fillStyle='#19395d';ctx.fillRect(640,211,135,85);
    root.dispatchEvent(new CustomEvent('cartwala:preview-ready',{detail:{url:canvas.toDataURL()}}));
    document.querySelector('#status').textContent='Design '+revision+' saved';
  }
  document.querySelector('#save').onclick=()=>{revision++;design()};
  document.querySelector('#black').onclick=()=>design(true);
  let lost;
  document.querySelector('#lose').onclick=()=>{lost=document.querySelector('canvas').getContext('webgl').getExtension('WEBGL_lose_context');lost.loseContext()};
  document.querySelector('#restore').onclick=()=>lost?.restoreContext();
  design();
  </script></body></html>`);
}).listen(4178, "0.0.0.0", () => console.log("Mug test fixture: http://localhost:4178"));
