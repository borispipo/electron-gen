const { program } = require('commander');
const supportedFrameworks = {
  expo : {
      buildCmd : "npx expo export -p web",
      buildOutDir : "dist",
  },
}

program.description('utilitaire cli pour la plateforme electron. NB : Le package electron doit être installé globalement via l\'instruction : npm i -g electron')
  .argument('<cmd>', 'la commande à exécuter (start,init,build,package). Start permet de démarrer le script electron, init permet d\'initialiser l\'application, build permet de compiler le code expo (exporter), package permet d\'effectuer le packaging de l\'application pour la distribution')
  //.option('-r, --project-root [dir]', 'le project root de l\'application')
  //.option('-c, --config [dir]', 'le chemin (relatif au project root) du fichier de configuration de l\'application electron')
  //.option('-s, --splash [dir]', 'le chemin (relatif au project root) du fichier du splash screen de l\'application')
  .option('-o, --out [dir]', 'le chemin du répertoire qui contiendra les fichiers générés à l\'aide de la commande make : ; commande : make')
  .option('--node-integration [boolean]', 'si l\'intégration node est autorisée')
  .option('-u, --url [url]', 'le lien url qui sera ouvert par l\'application; commande start')
  .option('-b, --build [boolean]', 'si ce flag est spécfifié alors l\'application sera compilée; combinée avec la commande start|package pour indiquer que l\'application sera à nouveau exportée ou pas.')
  .option('-a, --arch [architecture]', 'l\'architecture de la plateforme; Commande package')
  .option('-p, --platform [platform]', 'la plateforme à utiliser pour la compilation; commande package')
  .option("-n, --neutralino [boolean|true]","s'il s'agit des options du clié généré par l'utilitaire @fto-consult/neut")
  .option('-l, --icon [iconPath]', 'le chemin vers le dossier des icones de l\'application : (Dans ce dossier, doit contenir une image icon.ico pour window, icon.incs pour mac et icon.png pour linux)')
  .option('-i, --import [boolean]', 'la commande d\'initialisation du package electron forge, utile pour le packaging de l\'application. Elle permet d\'exécuter le cli electron package, pour l\'import d\'un projet existant. Commande package. exemple : expo-ui electron package --import')
  .option('-f, --framework [frameworkName]', `Le nom du framework utilisé pour générer l\'application electron. Les frameworks supportés sont pour l\'instant : [${Object.keys(supportedFrameworks)}]. Le framework [expo] est le framework par défaut`)

try {
  program.parse();
} catch(e){
  console.log(e," parsing electron-gen cli arguments")
};

module.exports = {
    supportedFrameworks,
    program,
    options :  Object.assign({},program.opts()),
    args : program.args,
    script : program.args[0]||"",
}