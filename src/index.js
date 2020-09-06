import './style.scss'
import * as roomMuseum from './rooms/Museum.js'

const {
    Scene, Color3, Vector3, UniversalCamera, DynamicTexture, StandardMaterial, MeshBuilder, PointerEventTypes, WebXRState
} = BABYLON

const context = {}

const init = async () => {
    const canvas = document.getElementById('renderCanvas')
    const engine = new BABYLON.Engine(canvas, true)
    context.engine = engine
    // createScene function that creates and return the scene

    // call the createScene function
    engine.displayLoadingUI()
    // const scene = await mapScene(engine, canvas)
    // Create the scene space
    const scene = new Scene(engine)
    const waterColor = new Color3(0.004, 0.608, 0.991)
    const skyColor = new Color3(0.01, 0.824, 1)
    scene.ambientColor = skyColor
    scene.clearColor = new Color3(0.01, 0.824, 1)
    scene.gravity = new Vector3(0, -9.81, 0)
    scene.collisionsEnabled = true
    context.scene = scene

    // // Sky
    // // Sky
    // var stars = Mesh.CreateSphere('stars', 100, 1000, scene)
    // stars.material = materialSky

    // Skybox
    const skybox = MeshBuilder.CreateSphere('skyBox', { diameter: 1000, segments: 100 }, scene)
    const skyboxMaterial = new StandardMaterial('skyBox', scene)
    skyboxMaterial.backFaceCulling = false
    skyboxMaterial.disableLighting = true
    skybox.infiniteDistance = true

    const textureSky = new DynamicTexture('SkyTexture', { width: 512, height: 512 }, scene)
    const ctx = textureSky.getContext()
    skyboxMaterial.reflectionTexture = textureSky
    const grd = ctx.createLinearGradient(0, 0, 0, 512)
    // grd.addColorStop(0, 'red')
    // grd.addColorStop(1, 'green')
    // grd.addColorStop(0, waterColor.toHexString()) // light #d1b7ce dark #1e2237
    // grd.addColorStop(0.65, waterColor.toHexString())
    // grd.addColorStop(0.75, skyColor.toHexString())
    grd.addColorStop(1, skyColor.toHexString())
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 512, 512)
    textureSky.update()
    skybox.material = skyboxMaterial

    // Add a camera to the scene and attach it to the canvas
    const camera = new UniversalCamera('Camera', new Vector3(0, 2.01, -2), scene)
    // camera.rotation = new Vector3(0, Math.PI, 0)
    camera.attachControl(canvas, true)
    camera.speed = 0.1
    camera.angularSensibility = 9000
    camera.applyGravity = true
    camera.ellipsoid = new Vector3(1, 1, 1)
    camera.checkCollisions = true

    // XR start
    const xrDefault = await scene.createDefaultXRExperienceAsync() // WebXRDefaultExperience
    xrDefault.input.onControllerAddedObservable.add((xrInput) => {
        xrInput.onMotionControllerInitObservable.add((motionController) => {
            // Watch for trigger events
            console.log(motionController.getComponentIds())
            const mainComponent = motionController.getMainComponent()
            console.log(mainComponent)
            if (mainComponent.isButton()) {
                console.log('its a button')
                mainComponent.onButtonStateChangedObservable.add((component) => {
                    console.log('button pressed', component.value)
                    context.mainComponentActive = (component.value === 1)
                })
            } else if (mainComponent.isAxes()) {
                console.log('its an axes')
                mainComponent.onAxisValueChangedObservable.add((values) => {
                    console.log('axis changed', values.x, values.y)
                    context.mainComponentActive = (values.x === 1 || values.y === 1)
                })
            }
            motionController.onModelLoadedObservable.add((model) => {
                // Attach stuff to the controllers if you want
            })
        })
    })
    context.xrDefault = xrDefault
    // xrDefault.teleportation.snapPointsOnly = true

    const xrHelper = xrDefault.baseExperience
    xrHelper.camera.setTransformationFromNonVRCamera(camera)
    context.xrHelper = xrHelper
    xrHelper.onStateChangedObservable.add((state) => {
        if (state === WebXRState.IN_XR) {
            xrHelper.camera.ellipsoid = new Vector3(1,1,1)
        }
    })

    xrHelper.onInitialXRPoseSetObservable.add((xrCamera) => {
        console.log('xrHelper onInitialXRPoseSetObservable')
        // xrCamera.onBeforeCameraTeleport as well
        xrCamera.onAfterCameraTeleport.add((pos) => {
            // This is the new position
            console.log('got a new position')
        })
        if (xrCamera.onAfterCameraTeleport) { // JS13kGames lib doesn't have this?
        }
    });

    // Interactions
    context.selectedMeshes = {}

    // POINTERDOWN
    scene.onPointerObservable.add((pointerInfo) => {
        const { pickInfo } = pointerInfo
        const { hit } = pickInfo
        const { pickedMesh } = pickInfo
        if (!hit) return
        if (!pickedMesh) return
        if (!pickedMesh.startInteraction) return
        context.selectedMeshes[pointerInfo.event.pointerId] = pickedMesh
        if (xrHelper && xrHelper.state === WebXRState.IN_XR) { // XR Mode
            const xrInput = xrDefault.pointerSelection.getXRControllerByPointerId(pointerInfo.event.pointerId)
            if (!xrInput) return
            const motionController = xrInput.motionController
            if (!motionController) return
            pickedMesh.startInteraction(pointerInfo, motionController.rootMesh, context)
        } else { // Regular drag and drop
            // Send the pointer ray I suppose?
            pickedMesh.startInteraction(pointerInfo, scene.activeCamera, context)
        }
    }, PointerEventTypes.POINTERDOWN)

    // POINTERMOVE
    scene.onPointerObservable.add((pointerInfo) => {
        const pickedMesh = context.selectedMeshes[pointerInfo.event.pointerId]
        if (pickedMesh && pickedMesh.moveInteraction) {
            pickedMesh.moveInteraction(pointerInfo, context)
        }
    }, PointerEventTypes.POINTERMOVE)

    // POINTERUP
    scene.onPointerObservable.add((pointerInfo) => {
        const pickedMesh = context.selectedMeshes[pointerInfo.event.pointerId]
        if (pickedMesh) {
            if (pickedMesh.endInteraction) {
                // console.log('POINTER END', pointerInfo, context)
                pickedMesh.endInteraction(pointerInfo, context)
            }
            delete context.selectedMeshes[pointerInfo.event.pointerId]
        }
    }, PointerEventTypes.POINTERUP)

    // Load the Ship
    await roomMuseum.setup(context)

    engine.hideLoadingUI()

    scene.debugLayer.show()

    // run the render loop
    engine.runRenderLoop(() => {
        scene.render()
    })

    // the canvas/window resize event handler
    window.addEventListener('resize', () => {
        engine.resize()
    })
}
window.addEventListener('DOMContentLoaded', init)
