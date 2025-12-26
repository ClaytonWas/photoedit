import './styles/styles.css'
import './scripts/taskbarHandler.js'
import './scripts/canvasHandler.js'
import './scripts/layersHandler.js'
import { initDockablePanels } from './scripts/core/dockablePanels.js'
import { populateDefaultImageProperties } from './scripts/canvasHandler.js'

// Populate default image properties BEFORE initializing dockable panels
// so the values are synced when windows are created
populateDefaultImageProperties()

// Initialize dockable window system
initDockablePanels()
