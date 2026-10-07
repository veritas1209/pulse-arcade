# Camera control sensitivity

The pan and zoom controls use roughly twice their previous sensitivity so each pointer or wheel gesture moves the view farther. Rotation speed remains unchanged. Camera minimum and maximum distances, polar angle limits, and swept wall clearance are unchanged.

Current OrbitControls values in `src/main.ts`:

- Pan: `1.6` (previously `0.8`)
- Zoom: `1.4` (previously `0.7`)
- Rotation: `0.65` (unchanged)

The wall guard also keeps the orbit target aligned with camera movement when a pan meets a wall. This preserves the current zoom anchor and camera distance after a blocked pan. Zoom limits and wall clearance remain unchanged.
