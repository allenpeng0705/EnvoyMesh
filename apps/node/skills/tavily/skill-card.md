## Description: <br>
AI-optimized web search using the Tavily Search API for research, current events lookup, domain-specific search, and AI-generated answer summaries. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[bert-builder](https://clawhub.ai/user/bert-builder) <br>

### License/Terms of Use: <br>


## Use Case: <br>
Developers and agents use this skill to run Tavily web, news, image, and domain-filtered searches, returning structured results and optional answer summaries for research and fact-checking. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Search queries are sent to Tavily under the user's API key. <br>
Mitigation: Use TAVILY_API_KEY or a secure configuration store, avoid placing keys on shared command lines, and do not send sensitive queries unless approved for the environment. <br>
Risk: Search results, raw page content, and AI-generated summaries may be incomplete, stale, or misleading. <br>
Mitigation: Treat returned content as untrusted until verified against authoritative sources before citing it or acting on it. <br>
Risk: The skill depends on the tavily-python package and Tavily service availability, pricing, and rate limits. <br>
Mitigation: Pin or review the dependency in sensitive environments and check plan limits before using advanced, raw-content, image, or high-result searches. <br>


## Reference(s): <br>
- [Tavily API Reference](references/api-reference.md) <br>
- [Tavily Documentation](https://docs.tavily.com) <br>
- [Tavily Python SDK](https://github.com/tavily-ai/tavily-python) <br>
- [Tavily](https://tavily.com) <br>


## Skill Output: <br>
**Output Type(s):** [Text, JSON, Shell commands, Configuration, Guidance] <br>
**Output Format:** [Markdown guidance with CLI examples and JSON search responses] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Requires tavily-python and a Tavily API key; supports basic or advanced depth, general or news topics, domain filters, optional images, and optional raw content.] <br>

## Skill Version(s): <br>
1.0.0 (source: server-resolved release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
