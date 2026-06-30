# college-aid-mcp

An MCP server that combines the **US College Scorecard** (Dept of Education) and **CareerOneStop Scholarship Finder** (Dept of Labor) so you can ask Claude to research colleges and matching scholarships in one conversation.

## What it can do

**`search_colleges`** — search colleges by name, state, degree type, or max tuition. Returns for each school:
- In-state / out-of-state tuition
- Median debt at graduation
- Median earnings 10 years after entry
- 4-year graduation rate
- Admission rate

**`search_scholarships`** — search 9,500+ scholarships and grants. Filter by keyword, state, study level. Returns award amount, deadline, provider, and direct link.

**`estimate_loan_repayment`** — pure computation, no API key needed. Given a loan balance and expected salary, calculates:
- Standard 10-year plan: monthly payment, total interest
- Extended 25-year plan: lower monthly cost, higher total interest
- Income-driven repayment (IDR): payment as % of discretionary income, forgiveness after 20 years if balance remains
- Debt-to-income health check and a recommendation on which plan makes sense

**`get_college_details`** — deep dive on a single school. Returns:
- Net price broken down by family income bracket ($0–30k, $30–48k, $48–75k, $75–110k, $110k+)
- SAT/ACT score ranges (25th–75th percentile)
- Acceptance rate, enrollment, 1st-year retention, 4-year graduation rate
- First-generation student share, Pell grant rate
- Median debt at graduation and 10-year earnings
- Institution type, Carnegie classification, locale

**`search_by_major`** — compare the same major across schools using program-specific data, not school-wide averages. Supports 60+ major aliases (e.g. `"cs"`, `"nursing"`, `"mechanical engineering"`) or raw 4-digit CIP codes. Returns for each school:
- Program-specific 4yr median earnings (vs. national benchmark for that program)
- Program-specific median student debt
- In-state tuition
- Sortable by earnings, debt, or tuition

### Example prompts
- *"Find CS-focused universities in Washington state with tuition under $15k and show me STEM scholarships I could apply to as a high schooler."*
- *"Compare median debt vs earnings for the top 10 engineering schools."*
- *"Find first-generation college student scholarships in California."*
- *"Rank nursing bachelor programs in Texas by earnings — which schools beat the national median?"*
- *"Show me mechanical engineering programs sorted by lowest debt in the midwest."*
- *"Get full details for Georgia Tech — what would I actually pay if my family earns $60k/year?"*
- *"Compare Georgia Tech and Carnegie Mellon on net price, SAT ranges, and 10-year earnings."*
- *"I'll graduate with $28k in debt and expect to earn $55k — show me my repayment options."*
- *"Find CS programs in California sorted by lowest debt, then estimate repayment for the top school."*

---

## Setup

### 1. Get API keys (both free)

**College Scorecard API key**
1. Go to [api.data.gov/signup](https://api.data.gov/signup/)
2. Register — you'll receive a key by email immediately
3. Set as env var: `COLLEGE_SCORECARD_API_KEY=your_key`

**CareerOneStop API credentials**
1. Go to [api.careeronestop.org/api-explorer](https://api.careeronestop.org/api-explorer/)
2. Register for a free account
3. You'll receive a **User ID** and **Token**
4. Set as env vars: `CAREERONESTOP_USER_ID=your_user_id` and `CAREERONESTOP_TOKEN=your_token`

### 2. Install

```bash
git clone https://github.com/Fusingchart/college-aid-mcp.git
cd college-aid-mcp
npm install
npm run build
```

### 3. Configure Claude Desktop

Add to your `claude_desktop_config.json` (usually at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "college-aid": {
      "command": "node",
      "args": ["/absolute/path/to/college-aid-mcp/build/index.js"],
      "env": {
        "COLLEGE_SCORECARD_API_KEY": "your_scorecard_key",
        "CAREERONESTOP_USER_ID": "your_user_id",
        "CAREERONESTOP_TOKEN": "your_token"
      }
    }
  }
}
```

### 4. Configure Claude Code

```bash
claude mcp add college-aid \
  -e COLLEGE_SCORECARD_API_KEY=your_key \
  -e CAREERONESTOP_USER_ID=your_user_id \
  -e CAREERONESTOP_TOKEN=your_token \
  -- node /absolute/path/to/college-aid-mcp/build/index.js
```

---

## Data sources

| Source | Provider | Cost |
|--------|----------|------|
| [College Scorecard API](https://collegescorecard.ed.gov/data/api/) | US Dept of Education | Free |
| [CareerOneStop Scholarship Finder](https://www.careeronestop.org/Toolkit/Training/find-scholarships.aspx) | US Dept of Labor | Free |
