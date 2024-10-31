import cytoscape, { NodeSingular } from "cytoscape";
import { Logger, SmashProfile } from "smash-node-lib";
import { UserID } from "./bot.js";

const DEFAULT_EDGE_WEIGHT = 20;
const SMASH_EDGE_WEIGHT = 100;

// TODO: check cytoscape docs for better use of pre-implemented fns
// TODO: distributed (handle graph reconciliation and spread/broadcast)
export default class SocialGraph {

    private graph;
    constructor(
        private logger: Logger,

    ) {
        this.graph = cytoscape();
    }

    getOrCreate(id: UserID) {
        // retrieve if exist, else add to the graph
        const nodes = this.graph.getElementById(id);
        if (nodes.length > 0) return nodes[0] as NodeSingular;
        return this.addNode(id) as NodeSingular;
    }

    connectDirected(a: UserID, b: UserID) {
        const edges = this.getDirectedEdges(a, b);
        if (edges.length >= 2) return this.logger.info(
            `${edges.length} edges already found between ${a} and ${b}`,
        );
        if (edges.length === 0) this.addDirectedEdge(a, b);
        this.addDirectedEdge(a, b, SMASH_EDGE_WEIGHT);
        this.computeScores();
        this.logger.debug(`> nodes ${a} and ${b} connected`);
    }

    disconnectDirected(a: UserID, b: UserID) {
        this.graph.remove(this.getDirectedEdges(a, b));
        this.computeScores();
        this.logger.debug(`> nodes ${a} and ${b} disconnected`);
    }

    resetEdges(a: UserID, b: UserID) {
        this.graph.remove(
            this.getOrCreate(a).edgesTo(this.getOrCreate(b))
        );
        this.addDirectedEdge(a, b);
        this.computeScores();
        this.logger.debug(`> nodes ${a} and ${b} cleared`);
    }

    private getDirectedEdges(a: UserID, b: UserID) {
        return this.getOrCreate(a).edgesTo(this.getOrCreate(b));
    }

    private addDirectedEdge(a: UserID, b: UserID, weight: number = DEFAULT_EDGE_WEIGHT) {
        this.graph.add({
            group: 'edges',
            data: SocialGraph.edgeData(a, b, weight),
        });
    }

    private static edgeData(a: UserID, b: UserID, weight: number = DEFAULT_EDGE_WEIGHT) {
        return {
            source: a,
            target: b,
        };
    }

    private addNode(id: UserID) {
        // all new nodes are fully connected to existing ones
        // both ways (directed graph!)
        const edges = this.graph.nodes().map(node => (
            SocialGraph.edgeData(id, node.id())
        )).concat(this.graph.nodes().map(node => (
            SocialGraph.edgeData(node.id(), id)
        )));
        this.logger.debug(JSON.stringify(edges, null, 2));
        const node = this.graph.add({
            group: 'nodes',
            data: { id },
        });
        if (edges.length > 0) edges.forEach(edge => this.graph.add({
            group: 'edges',
            data: edge,
        }));
        this.computeScores();
        this.logger.debug(`> ${id} added & connected to the graph.`);
        return node;
    }

    private scores: { id: UserID, score: number }[] = [];
    getScores() {
        if (this.scores.length === 0) this.computeScores();
        return this.scores;
    }

    private computeScores() {
        this.logger.debug(`> refreshing graph scores`);
        // NOTE: pagerank does not account for the edge weight
        const pageRank = this.graph.elements().pageRank({});
        this.scores = this.graph.nodes().map(node => ({
            id: node.id(),
            score: pageRank.rank(node),
        })).toSorted((a, b) => b.score - a.score);
    }

    get json() {
        return this.graph.json.bind(this.graph);
    }

}
