const fs = require("fs");
const p = require("path");
module.exports = function writeFile(path, contents, ...rest) {
  if(typeof path =='string' && path){
    const fileName = p.basename(path);
    if(fileName){
      const pp = p.dirname(path);
      if(require("./createDir")(pp)){
        return fs.writeFileSync(p.join(pp,fileName), contents, ...rest);
      }
    }
  }
  throw {message : 'impossible de créer le repertoire associé au fichier'+path};
}