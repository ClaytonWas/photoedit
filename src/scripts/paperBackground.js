/**
 * Paper.js Liquid Metal Background
 * Creates an animated, flowing metallic blob effect
 */
import paper from 'paper';

export function initPaperBackground() {
    const canvas = document.getElementById('paperCanvas');
    if (!canvas) return;

    paper.setup(canvas);
    
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Liquid metal color palette
    const colors = isDark 
        ? ['#3a3a5a', '#2a2a4a', '#4a4a6a', '#5a5a7a', '#1a1a3a']
        : ['#c4c7cc', '#d4d7dc', '#e8eaed', '#b4b7bc', '#a4a7ac'];
    
    const blobs = [];
    const numBlobs = Math.min(6, Math.floor(window.innerWidth / 200));
    
    // Create liquid metal blobs
    for (let i = 0; i < numBlobs; i++) {
        const blob = createBlob(colors[i % colors.length], i);
        blobs.push(blob);
    }
    
    function createBlob(color, index) {
        const center = new paper.Point(
            Math.random() * paper.view.size.width,
            Math.random() * paper.view.size.height
        );
        
        const numSegments = 8;
        const radius = 80 + Math.random() * 120;
        const points = [];
        
        for (let i = 0; i < numSegments; i++) {
            const angle = (i / numSegments) * Math.PI * 2;
            const x = center.x + Math.cos(angle) * radius;
            const y = center.y + Math.sin(angle) * radius;
            points.push(new paper.Point(x, y));
        }
        
        const path = new paper.Path({
            segments: points,
            closed: true,
            fillColor: {
                gradient: {
                    stops: [
                        [new paper.Color(color).add(0.15), 0],
                        [color, 0.5],
                        [new paper.Color(color).subtract(0.1), 1]
                    ],
                    radial: true
                },
                origin: center,
                destination: center.add([radius, 0])
            },
            opacity: isDark ? 0.4 : 0.5,
            blendMode: 'overlay'
        });
        
        path.smooth({ type: 'continuous' });
        
        return {
            path,
            center,
            radius,
            velocity: new paper.Point(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5
            ),
            phaseOffset: index * 0.8,
            originalSegments: path.segments.map(s => s.point.clone())
        };
    }
    
    let time = 0;
    
    paper.view.onFrame = function(event) {
        time += event.delta;
        
        blobs.forEach((blob, blobIndex) => {
            // Move blob slowly
            blob.center = blob.center.add(blob.velocity);
            
            // Bounce off edges with smooth transition
            const margin = blob.radius;
            if (blob.center.x < margin || blob.center.x > paper.view.size.width - margin) {
                blob.velocity.x *= -1;
            }
            if (blob.center.y < margin || blob.center.y > paper.view.size.height - margin) {
                blob.velocity.y *= -1;
            }
            
            // Animate blob shape - liquid metal morphing
            blob.path.segments.forEach((segment, i) => {
                const original = blob.originalSegments[i];
                const angle = (i / blob.path.segments.length) * Math.PI * 2;
                
                // Multiple wave frequencies for organic movement
                const wave1 = Math.sin(time * 0.8 + angle * 2 + blob.phaseOffset) * 15;
                const wave2 = Math.sin(time * 1.2 + angle * 3 + blob.phaseOffset) * 8;
                const wave3 = Math.cos(time * 0.5 + angle + blob.phaseOffset) * 12;
                
                const offset = wave1 + wave2 + wave3;
                
                const direction = new paper.Point(
                    Math.cos(angle),
                    Math.sin(angle)
                );
                
                segment.point = blob.center.add(direction.multiply(blob.radius + offset));
            });
            
            blob.path.smooth({ type: 'continuous' });
            
            // Update gradient center
            blob.path.fillColor.origin = blob.center;
            blob.path.fillColor.destination = blob.center.add([blob.radius, 0]);
        });
    };
    
    // Handle resize
    const resizeHandler = () => {
        paper.view.viewSize = new paper.Size(window.innerWidth, window.innerHeight);
        
        blobs.forEach(blob => {
            // Keep blobs in bounds after resize
            blob.center.x = Math.min(blob.center.x, paper.view.size.width - blob.radius);
            blob.center.y = Math.min(blob.center.y, paper.view.size.height - blob.radius);
        });
    };
    
    window.addEventListener('resize', resizeHandler);
    
    // Handle theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const newColors = e.matches 
            ? ['#3a3a5a', '#2a2a4a', '#4a4a6a', '#5a5a7a', '#1a1a3a']
            : ['#c4c7cc', '#d4d7dc', '#e8eaed', '#b4b7bc', '#a4a7ac'];
        
        blobs.forEach((blob, i) => {
            const color = newColors[i % newColors.length];
            blob.path.fillColor = {
                gradient: {
                    stops: [
                        [new paper.Color(color).add(0.15), 0],
                        [color, 0.5],
                        [new paper.Color(color).subtract(0.1), 1]
                    ],
                    radial: true
                },
                origin: blob.center,
                destination: blob.center.add([blob.radius, 0])
            };
            blob.path.opacity = e.matches ? 0.4 : 0.5;
        });
    });
}
