//% color="#E63946" weight=95 icon="\uf6d1" block="Physics"
namespace physics {

    // ── Internal types ───────────────────────────────────────────────────────

    class PhysSprite {
        id: number
        px: number   // float x position 0.0–4.0
        py: number   // float y position 0.0–4.0
        vx: number   // velocity x
        vy: number   // velocity y
        restitution: number  // bounciness 0.0–1.0
        friction: number     // 0.0–1.0
        active: boolean

        constructor(id: number, x: number, y: number) {
            this.id = id
            this.px = x
            this.py = y
            this.vx = 0
            this.vy = 0
            this.restitution = 0.6
            this.friction = 0.8
            this.active = true
        }
    }

    // Elastic rope: 5 nodes, one per column
    class Rope {
        y: number        // rest y position (0–4)
        nodeY: number[]  // current y offset of each node (0–2 sag)
        nodeV: number[]  // velocity of each node
        stiffness: number
        damping: number
        active: boolean

        constructor(restY: number) {
            this.y = restY
            this.nodeY = [0, 0, 0, 0, 0]
            this.nodeV = [0, 0, 0, 0, 0]
            this.stiffness = 0.4
            this.damping = 0.6
            this.active = true
        }
    }

    let sprites: PhysSprite[] = []
    let ropes: Rope[] = []
    let gravity = 0.12
    let running = false
    let nextId = 0
    let _useAccel = false

    // ── SPRITES ──────────────────────────────────────────────────────────────

    /**
     * Create a physics sprite at a grid position (0–4).
     * Returns the sprite ID used for other blocks.
     * @param x Column 0–4, eg: 2
     * @param y Row 0–4, eg: 0
     */
    //% blockId=physics_createSprite
    //% block="create physics sprite at x %x y %y"
    //% x.min=0 x.max=4 x.defl=2
    //% y.min=0 y.max=4 y.defl=0
    //% weight=100
    //% group="Sprites"
    export function createSprite(x: number, y: number): number {
        let s = new PhysSprite(nextId++, x, y)
        sprites.push(s)
        return s.id
    }

    /**
     * Set the material of a sprite. Affects how it bounces.
     * @param id Sprite ID from "create physics sprite"
     * @param material Material type
     */
    //% blockId=physics_setMaterial
    //% block="set sprite %id material to %material"
    //% id.defl=0
    //% weight=90
    //% group="Sprites"
    export function setMaterial(id: number, material: Material): void {
        let s = _getSprite(id)
        if (!s) return
        if (material == Material.Bouncy) {
            s.restitution = 0.92
            s.friction = 0.98
        } else if (material == Material.Hard) {
            s.restitution = 0.1
            s.friction = 0.5
        } else if (material == Material.Plastic) {
            s.restitution = 0.5
            s.friction = 0.75
        } else if (material == Material.Rubber) {
            s.restitution = 0.85
            s.friction = 0.95
        } else if (material == Material.Ice) {
            s.restitution = 0.3
            s.friction = 0.99
        }
    }

    /**
     * Give a sprite an initial velocity (push it).
     * @param id Sprite ID
     * @param vx Horizontal speed -5 to 5, eg: 1
     * @param vy Vertical speed -5 to 5, eg: -2
     */
    //% blockId=physics_setVelocity
    //% block="push sprite %id vx %vx vy %vy"
    //% id.defl=0
    //% vx.min=-5 vx.max=5 vx.defl=1
    //% vy.min=-5 vy.max=5 vy.defl=-2
    //% weight=85
    //% group="Sprites"
    export function setVelocity(id: number, vx: number, vy: number): void {
        let s = _getSprite(id)
        if (!s) return
        s.vx = vx * 0.3
        s.vy = vy * 0.3
    }

    /**
     * Move a sprite to a new position instantly.
     * @param id Sprite ID
     * @param x New column 0–4, eg: 2
     * @param y New row 0–4, eg: 0
     */
    //% blockId=physics_moveSprite
    //% block="move sprite %id to x %x y %y"
    //% id.defl=0
    //% x.min=0 x.max=4 x.defl=2
    //% y.min=0 y.max=4 y.defl=0
    //% weight=80
    //% group="Sprites"
    export function moveSprite(id: number, x: number, y: number): void {
        let s = _getSprite(id)
        if (!s) return
        s.px = x
        s.py = y
        s.vx = 0
        s.vy = 0
    }

    /**
     * Remove a sprite from the simulation.
     * @param id Sprite ID, eg: 0
     */
    //% blockId=physics_removeSprite
    //% block="remove sprite %id"
    //% id.defl=0
    //% weight=70
    //% group="Sprites"
    export function removeSprite(id: number): void {
        let s = _getSprite(id)
        if (s) s.active = false
    }

    // ── ROPE ─────────────────────────────────────────────────────────────────

    /**
     * Create an elastic rope/line that sags when sprites land on it.
     * @param y Row position 0–4 for the rope, eg: 3
     */
    //% blockId=physics_createRope
    //% block="create elastic rope at row %y"
    //% y.min=0 y.max=4 y.defl=3
    //% weight=95
    //% group="Rope"
    export function createRope(y: number): void {
        ropes.push(new Rope(y))
    }

    /**
     * Set how stretchy the rope is (1=very stiff, 10=very elastic).
     * @param stretch Elasticity 1–10, eg: 5
     */
    //% blockId=physics_setRopeStretch
    //% block="set rope elasticity %stretch"
    //% stretch.min=1 stretch.max=10 stretch.defl=5
    //% weight=80
    //% group="Rope"
    export function setRopeElasticity(stretch: number): void {
        for (let r of ropes) {
            r.stiffness = stretch * 0.08
            r.damping = 0.55 + stretch * 0.02
        }
    }

    /**
     * Remove all ropes.
     */
    //% blockId=physics_clearRopes
    //% block="remove all ropes"
    //% weight=60
    //% group="Rope"
    export function clearRopes(): void {
        ropes = []
    }

    // ── WORLD ────────────────────────────────────────────────────────────────

    /**
     * Set gravity strength (0=no gravity, 10=very strong).
     * @param strength 0–10, eg: 5
     */
    //% blockId=physics_setGravity
    //% block="set gravity %strength"
    //% strength.min=0 strength.max=10 strength.defl=5
    //% weight=95
    //% group="World"
    export function setGravity(strength: number): void {
        gravity = strength * 0.024
    }

    /**
     * Use the micro:bit's tilt to control gravity direction.
     * @param on Turn on/off, eg: true
     */
    //% blockId=physics_useAccel
    //% block="tilt controls gravity %on"
    //% on.defl=true
    //% weight=85
    //% group="World"
    export function tiltGravity(on: boolean): void {
        _useAccel = on
    }

    /**
     * Start the physics simulation. Call once after setup.
     */
    //% blockId=physics_start
    //% block="start physics"
    //% weight=100
    //% group="World"
    export function start(): void {
        if (running) return
        running = true
        control.inBackground(function () {
            while (running) {
                _step()
                _render()
                basic.pause(80)
            }
        })
    }

    /**
     * Stop the physics simulation.
     */
    //% blockId=physics_stop
    //% block="stop physics"
    //% weight=90
    //% group="World"
    export function stop(): void {
        running = false
        basic.clearScreen()
    }

    /**
     * Remove all sprites and ropes and stop the simulation.
     */
    //% blockId=physics_reset
    //% block="reset physics"
    //% weight=70
    //% group="World"
    export function reset(): void {
        running = false
        sprites = []
        ropes = []
        nextId = 0
        basic.clearScreen()
    }

    // ── STATUS ───────────────────────────────────────────────────────────────

    /**
     * Get the X position of a sprite (0–4).
     * @param id Sprite ID, eg: 0
     */
    //% blockId=physics_getSpriteX
    //% block="sprite %id x"
    //% id.defl=0
    //% weight=50
    //% group="Status"
    export function getSpriteX(id: number): number {
        let s = _getSprite(id)
        return s ? Math.round(s.px) : 0
    }

    /**
     * Get the Y position of a sprite (0–4).
     * @param id Sprite ID, eg: 0
     */
    //% blockId=physics_getSpriteY
    //% block="sprite %id y"
    //% id.defl=0
    //% weight=48
    //% group="Status"
    export function getSpriteY(id: number): number {
        let s = _getSprite(id)
        return s ? Math.round(s.py) : 0
    }

    /**
     * True if two sprites are at the same grid position.
     * @param id1 First sprite ID, eg: 0
     * @param id2 Second sprite ID, eg: 1
     */
    //% blockId=physics_colliding
    //% block="sprite %id1 colliding with sprite %id2"
    //% id1.defl=0 id2.defl=1
    //% weight=45
    //% group="Status"
    export function colliding(id1: number, id2: number): boolean {
        let a = _getSprite(id1)
        let b = _getSprite(id2)
        if (!a || !b) return false
        return Math.abs(a.px - b.px) < 0.8 && Math.abs(a.py - b.py) < 0.8
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    function _getSprite(id: number): PhysSprite {
        for (let s of sprites) {
            if (s.id == id && s.active) return s
        }
        return null
    }

    function _step(): void {
        let gx = 0
        let gy = gravity

        if (_useAccel) {
            let ax = input.acceleration(Dimension.X)
            let ay = input.acceleration(Dimension.Y)
            gx = (ax / 1024) * 0.3
            gy = (ay / 1024) * 0.3
            if (gy < 0) gy = 0 - gy
        }

        // Update sprites
        for (let s of sprites) {
            if (!s.active) continue

            s.vy += gy
            s.vx += gx

            s.px += s.vx
            s.py += s.vy

            // Wall collisions
            if (s.px < 0) {
                s.px = 0
                s.vx = 0 - s.vx * s.restitution
            }
            if (s.px > 4) {
                s.px = 4
                s.vx = 0 - s.vx * s.restitution
            }

            // Floor collision
            if (s.py >= 4) {
                s.py = 4
                s.vy = 0 - s.vy * s.restitution
                s.vx = s.vx * s.friction
                if (Math.abs(s.vy) < 0.05) s.vy = 0
            }

            // Ceiling
            if (s.py < 0) {
                s.py = 0
                s.vy = 0 - s.vy * s.restitution
            }

            // Rope collisions
            for (let r of ropes) {
                if (!r.active) continue
                let col = Math.round(s.px)
                let ropeY = r.y + r.nodeY[col]
                if (s.py >= ropeY - 0.3 && s.py <= ropeY + 0.5 && s.vy > 0) {
                    s.py = ropeY - 0.3
                    r.nodeV[col] += s.vy * 0.5
                    s.vy = 0 - s.vy * s.restitution * 0.7
                    s.vx = s.vx * s.friction
                }
            }
        }

        // Update rope nodes (spring simulation)
        for (let r of ropes) {
            if (!r.active) continue
            for (let i = 0; i < 5; i++) {
                // Spring back to rest
                r.nodeV[i] += 0 - r.nodeY[i] * r.stiffness
                // Neighbor tension
                if (i > 0) r.nodeV[i] += (r.nodeY[i - 1] - r.nodeY[i]) * 0.15
                if (i < 4) r.nodeV[i] += (r.nodeY[i + 1] - r.nodeY[i]) * 0.15
                r.nodeV[i] = r.nodeV[i] * r.damping
                r.nodeY[i] += r.nodeV[i]
                // Clamp sag
                if (r.nodeY[i] < 0) r.nodeY[i] = 0
                if (r.nodeY[i] > 3) r.nodeY[i] = 3
            }
        }

        // Sprite vs sprite bounce
        for (let i = 0; i < sprites.length; i++) {
            for (let j = i + 1; j < sprites.length; j++) {
                let a = sprites[i]
                let b = sprites[j]
                if (!a.active || !b.active) continue
                let dx = a.px - b.px
                let dy = a.py - b.py
                let dist = dx * dx + dy * dy
                if (dist < 0.7 && dist > 0) {
                    let res = (a.restitution + b.restitution) / 2
                    let tvx = a.vx
                    let tvy = a.vy
                    a.vx = b.vx * res
                    a.vy = b.vy * res
                    b.vx = tvx * res
                    b.vy = tvy * res
                }
            }
        }
    }

    function _render(): void {
        basic.clearScreen()

        // Draw ropes
        for (let r of ropes) {
            if (!r.active) continue
            for (let col = 0; col < 5; col++) {
                let row = Math.round(r.y + r.nodeY[col])
                if (row >= 0 && row <= 4) {
                    led.plot(col, row)
                }
            }
        }

        // Draw sprites
        for (let s of sprites) {
            if (!s.active) continue
            let px = Math.round(s.px)
            let py = Math.round(s.py)
            if (px >= 0 && px <= 4 && py >= 0 && py <= 4) {
                led.plot(px, py)
            }
        }
    }
}

// ── Material enum ─────────────────────────────────────────────────────────────
const enum Material {
    //% block="bouncy"
    Bouncy = 0,
    //% block="hard"
    Hard = 1,
    //% block="plastic"
    Plastic = 2,
    //% block="rubber"
    Rubber = 3,
    //% block="ice"
    Ice = 4
}
