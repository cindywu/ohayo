#! /usr/local/bin/node

const express = require("express")
const bodyParser = require("body-parser")
const glob = require("glob")
const fs = require("fs")

const { jtree } = require("jtree")

const StudioServerAppConstants = {}
StudioServerAppConstants.routeFileGlob = "/*/*.routes.js"
StudioServerAppConstants.ohayoPackagesFolder = "/ohayo/packages/"

class StudioServerApp {
  constructor(port = 1111, cwd = process.cwd(), hostname = "localhost", protocol = "http") {
    this._cwd = cwd.replace(/\/$/, "") + "/"
    this._port = port
    this._hostname = hostname
    this._protocol = protocol
    this._verboseOn = true
  }

  getCwd() {
    return this._cwd
  }

  get app() {
    if (!this._app) this._initApp()
    return this._app
  }

  _addCurrentWorkingDirectory(content, cwd) {
    return content.replace(`const DefaultServerCurrentWorkingDirectory = "/"`, `const isConnectedToStudioServerApp = true;\nconst DefaultServerCurrentWorkingDirectory = "${cwd}"`)
  }

  _getPackageDirectories() {
    return [__dirname + StudioServerAppConstants.ohayoPackagesFolder]
  }

  _getStaticRoutes() {
    // this dir and whatever folder someone started it in for plugins
    return [__dirname + "/", this.getCwd()]
  }

  _initApp() {
    const app = express()
    this._app = app
    app.use(bodyParser.urlencoded({ extended: false }))
    app.use(bodyParser.json())
    app.cwd = this.getCwd()

    this._addHomeRoute()
    this._addOtherRoutes()
    this._getStaticRoutes().forEach(path => this._initStaticRoute(path))

    // Load: standard. node_modules. custom-packages.
    this._getPackageDirectories().forEach(dir => this._initPackageFolder(dir))

    return app
  }

  _addOtherRoutes() {}

  _initStaticRoute(path) {
    this.app.use(
      "/",
      express.static(path, {
        maxAge: 31557600000
      })
    )
  }

  _verbose(msg) {
    if (this._verboseOn) console.log(msg)
  }

  _initPackageFolder(folder) {
    this._verbose(`Loading folder ${folder}...`)
    // todo: don't recurse.
    jtree.Utils.flatten(glob.sync(folder + StudioServerAppConstants.routeFileGlob)).forEach(filePath => {
      this._verbose(`Loading package ${filePath}...`)
      require(filePath)(this.app)
    })
  }

  _getUrlBase() {
    return `${this._protocol}://${this._hostname}:${this._port}/`
  }

  _getHomePage() {
    return "index.html"
  }

  _addHomeRoute() {
    this.app.get("/" + this._getHomePage(), (req, res) => {
      // Avoid cacheing
      res.send(this._addCurrentWorkingDirectory(fs.readFileSync(__dirname + "/" + this._getHomePage(), "utf8"), this.getCwd()))
    })
  }

  start() {
    this.app.listen(this._port, () => {
      console.log(`Running ${this.constructor.name} in folder '${this.getCwd()}'. cmd+dblclick: ${this._getUrlBase()}${this._getHomePage()}`)
    })
  }
}

class DevServer extends StudioServerApp {
  _onFileChange(event, filename) {
    return "todo: restore"
    const { Builder } = require("./builder.ts")
    // Note: if this ever becomes a load problem we can look for changes
    // Note: do we want this? What if it fails? What if its partial?
    if (filename.includes("node_modules/") || filename.includes("ignore/")) return true
    console.log(`Changes to 'studio/${filename}' detected. Building dev.html...`)
    new Builder().produceDevHtml()
  }

  listenForFileChanges() {
    fs.watch("studio/", { recursive: true }, (event, filename) => this._onFileChange(event, filename))
    fs.watch("ohayo/", { recursive: true }, (event, filename) => this._onFileChange(event, filename))
    return this
  }

  _getHomePage() {
    return "dev.html"
  }

  _addOtherRoutes() {
    const sendDevMessage = (req, res) => res.send(`This is dev server. Visit ${this._getHomePage()} instead.`)

    this.app.get("/devWithLocalStorage.html", (req, res) => {
      res.send(fs.readFileSync(__dirname + "/" + this._getHomePage(), "utf8"))
    })

    this.app.get("/index.html", sendDevMessage)
    this.app.get("/", sendDevMessage)

    const { TypeScriptRewriter } = require("jtree/products/TypeScriptRewriter.js")
    // todo; cleanup
    const treeFiles = "Studio.drums challenges.tree Templates.stamp".split(" ")
    treeFiles.forEach(name => {
      this.app.get(new RegExp(`.*/${name}`), (req, res) => {
        const filename = __dirname + req.path
        fs.readFile(filename, "utf8", (err, file) => {
          res.send(TypeScriptRewriter.treeToJs(filename, file))
        })
      })
    })

    // todo: cleanup
    const serveDevFile = (req, res, next) => {
      const filename = __dirname + req.path
      fs.readFile(filename, "utf8", (err, file) => {
        if (err) {
          console.log(err)
          return res.status(400).send(err)
        } else if (filename.endsWith(".js") && !filename.endsWith("min.js")) {
          res.send(
            new TypeScriptRewriter(file)
              .removeRequires()
              .changeNodeExportsToWindowExports()
              .changeDefaultExportsToWindowExports()
              .removeTsGeneratedCrap()
              .removeNodeJsOnly()
              .removeImports()
              .removeExports()
              .addUseStrictIfNotPresent()
              .getString()
          )
        } else res.send(file)
      })
    }

    this.app.get(/.*(studio|ohayo)\/.*\.(js)/, serveDevFile)
    return this
  }
}

module.exports = { StudioServerApp, DevServer }
