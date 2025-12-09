import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Contact } from '../types';

interface NetworkGraphProps {
  contacts: Contact[];
  onNodeClick: (contactId: string) => void;
}

const NetworkGraph: React.FC<NetworkGraphProps> = ({ contacts, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || contacts.length === 0) return;

    // Clear previous graph
    d3.select(svgRef.current).selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // 1. Prepare Data
    const nodes = contacts.map(c => ({ ...c, id: c.id, group: 1 }));
    const links: any[] = [];

    const contactMap = new Map(contacts.map(c => [c.name, c.id]));

    contacts.forEach(source => {
      // Link by explicit relatedPeople
      source.relatedPeople.forEach(rel => {
        const targetId = contactMap.get(rel.name);
        if (targetId) {
          links.push({ source: source.id, target: targetId, value: 2, type: rel.relationship });
        }
      });

      // Link by implicit Company
      if (source.company) {
        contacts.forEach(target => {
          if (source.id !== target.id && source.company === target.company) {
             if (source.id < target.id) {
               links.push({ source: source.id, target: target.id, value: 1, type: "Colleague" });
             }
          }
        });
      }
    });

    // 2. Setup Simulation (Optimized for better distribution)
    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150)) // Increased distance for breathing room
      .force("charge", d3.forceManyBody().strength(-1000)) // Stronger repulsion to spread nodes
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.08)) // Gentle pull to center horizontally
      .force("y", d3.forceY(height / 2).strength(0.08)) // Gentle pull to center vertically
      .force("collide", d3.forceCollide().radius(55).iterations(2)); // Prevent overlap of squares

    const svg = d3.select(svgRef.current);
    
    // Zoom behavior
    const g = svg.append("g");
    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 4])
      .on("zoom", ({ transform }) => {
        g.attr("transform", transform);
      }));

    // 3. Draw Lines
    const link = g.append("g")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", 0.4)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (d: any) => Math.sqrt(d.value) * 1.5);

    // 4. Draw Nodes
    const node = g.append("g")
      .attr("cursor", "pointer")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .on("click", (event, d: any) => onNodeClick(d.id))
      .call((d3.drag() as any)
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended));

    // Node Visuals: Rounded Square
    const nodeSize = 64;
    const cornerRadius = 16;

    // Square Background
    node.append("rect")
      .attr("width", nodeSize)
      .attr("height", nodeSize)
      .attr("x", -nodeSize / 2)
      .attr("y", -nodeSize / 2)
      .attr("rx", cornerRadius)
      .attr("ry", cornerRadius)
      .attr("fill", (d: any) => {
          // Generate color hash
          let hash = 0;
          for (let i = 0; i < d.name.length; i++) hash = d.name.charCodeAt(i) + ((hash << 5) - hash);
          const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
          return '#' + '00000'.substring(0, 6 - c.length) + c;
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 2.5)
      .style("filter", "drop-shadow(0px 4px 4px rgba(0,0,0,0.15))"); // Nice shadow
    
    // Text Inside Node (Name, 2-6 chars)
    node.append("text")
      .text((d: any) => {
         // Display 2-6 chars. If longer, truncate with ..
         return d.name.length > 6 ? d.name.substring(0, 5) + '..' : d.name;
      })
      .attr("x", 0)
      .attr("y", 0)
      .attr("dy", "0.35em") // Vertically center
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("font-size", (d: any) => {
          const len = d.name.length;
          // Adaptive font size
          if (len <= 2) return "18px";
          if (len <= 3) return "16px";
          if (len <= 4) return "15px";
          return "13px"; // 5-6 chars
      })
      .attr("font-weight", "bold")
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 3px rgba(0,0,0,0.3)");

    // Label Below Node (Title or Company)
    node.append("text")
      .text((d: any) => {
        const info = d.title || d.company;
        if (!info) return "";
        return info.length > 8 ? info.substring(0, 7) + ".." : info;
      })
      .attr("x", 0)
      .attr("y", nodeSize / 2 + 16)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("stroke", "none")
      .attr("font-size", "10px")
      .attr("font-weight", "500")
      .style("pointer-events", "none");

    // 5. Tick Function
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag Helper functions
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [contacts, onNodeClick]);

  return (
    <div className="w-full h-full bg-slate-50 relative overflow-hidden rounded-xl border border-slate-200 shadow-inner">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 bg-white/80 backdrop-blur p-2 rounded shadow text-xs text-slate-500 pointer-events-none">
        <p>滚轮缩放 • 拖拽节点</p>
        <p>连线表示关系</p>
      </div>
    </div>
  );
};

export default NetworkGraph;