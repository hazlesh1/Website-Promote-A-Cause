import json
import random
from flask import Flask, render_template, request, jsonify
import ollama
from pydantic import BaseModel

app = Flask(__name__)

# Load scenarios
with open('scenarios.json', 'r', encoding='utf-8') as f:
    SCENARIOS = json.load(f)

class Feedback(BaseModel):
    rating: str # "good", "ok", or "wrong"
    message: str
    tip: str

class ScenarioOption(BaseModel):
    a: str
    b: str
    c: str

class ScenarioItem(BaseModel):
    category: str
    scenario: str
    question: str
    options: ScenarioOption

class ScenarioList(BaseModel):
    scenarios: list[ScenarioItem]

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/scenario', methods=['POST'])
def get_scenario():
    data = request.json or {}
    correct_ids = data.get('correctIds', [])
    
    available = [s for s in SCENARIOS if s.get('id') not in correct_ids]
    if not available:
        return jsonify({"error": "No more scenarios available"}), 404
        
    scenario = random.choice(available)
    return jsonify(scenario)

@app.route('/api/generate_scenarios', methods=['POST'])
def generate_scenarios():
    global SCENARIOS
    prompt = """
Generate 5 diverse, realistic scenarios for a decision-making simulator targeted at teenagers (13-16 years old).
The theme is "Mental Health and Social Media Use", focusing on teaching the difference between "active" and "passive" scrolling, and the importance of quality over quantity of screen time.
Provide a situation (scenario) involving social media, a question (e.g., What do you do?), and 3 options (a, b, c).
Make one option represent healthy 'active' use (good), one 'neutral' or avoiding (okay), and one unhealthy 'passive' use (wrong).

IMPORTANT: You MUST respond STRICTLY with a valid JSON object matching exactly this structure:
{
  "scenarios": [
    {
      "category": "Mental Health",
      "scenario": "Your scenario text here",
      "question": "What do you do?",
      "options": {
        "a": "Active choice text",
        "b": "Neutral choice text",
        "c": "Passive choice text"
      }
    }
  ]
}
"""
    try:
        response = ollama.chat(
            model='gpt-oss:120b-cloud',
            messages=[{'role': 'user', 'content': prompt}],
            format=ScenarioList.model_json_schema(),
            options={'temperature': 0.7}
        )
        
        content = response.message.content.strip()
        if content.startswith("```"):
            content = content.strip("`").strip()
            if content.lower().startswith("json"):
                content = content[4:].strip()
                
        scenario_data = ScenarioList.model_validate_json(content)
        
        new_scenarios = []
        for i, item in enumerate(scenario_data.scenarios):
            s_dict = item.model_dump()
            s_dict['id'] = i + 1
            new_scenarios.append(s_dict)
            
        with open('scenarios.json', 'w', encoding='utf-8') as f:
            json.dump(new_scenarios, f, indent=2)
            
        SCENARIOS = new_scenarios
        return jsonify({"status": "success", "count": len(SCENARIOS)})
    except Exception as e:
        print(f"Generation error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/end_summary', methods=['POST'])
def end_summary():
    data = request.json or {}
    correct_count = data.get('correctCount', 0)
    wrong_count = data.get('wrongCount', 0)
    total = correct_count + wrong_count
    
    prompt = f"""
    The user just completed a decision-making quiz.
    They got {correct_count} correct and {wrong_count} wrong out of {total} total scenarios.
    Provide a brief, encouraging 2-sentence summary of their performance.
    Respond with plain text only, no markdown blocks or JSON.
    """
    
    try:
        response = ollama.chat(
            model='gpt-oss:120b-cloud',
            messages=[{'role': 'user', 'content': prompt}],
            options={'temperature': 0.5}
        )
        return jsonify({"summary": response.message.content.strip()})
    except Exception as e:
        print(f"Summary error: {e}")
        return jsonify({"summary": "Great job completing the simulation! Keep practicing to improve your decision-making."})

@app.route('/api/feedback', methods=['POST'])
def get_feedback():
    data = request.json
    scenario_id = data.get('scenarioId')
    user_answer = data.get('answer') # 'a', 'b', or 'c'
    
    scenario = next((s for s in SCENARIOS if s['id'] == scenario_id), None)
    if not scenario:
        return jsonify({"error": "Scenario not found"}), 404
        
    answer_text = scenario['options'].get(user_answer)
    
    prompt = f"""
Scenario: {scenario['scenario']}
Question: {scenario['question']}
User chose: {answer_text}

Evaluate the user's choice in the context of healthy teenage social media habits and mental health. 
Provide a rating ("good", "ok", or "wrong"), an educational feedback message explaining the psychological impact of their choice (e.g., active vs passive scrolling), and a quick actionable tip for healthier screen time.
You MUST respond STRICTLY with a valid JSON object and nothing else.
Format: {{"rating": "...", "message": "...", "tip": "..."}}
"""
    
    try:
        response = ollama.chat(
            model='gpt-oss:120b-cloud',
            messages=[{'role': 'user', 'content': prompt}],
            format=Feedback.model_json_schema(),
            options={'temperature': 0.3}
        )
        
        content = response.message.content.strip()
        if content.startswith("```"):
            content = content.strip("`").strip()
            if content.lower().startswith("json"):
                content = content[4:].strip()
                
        feedback_data = Feedback.model_validate_json(content)
        return jsonify(feedback_data.model_dump())
    except Exception as e:
        print(f"Ollama Error: {e}")
        # Fallback response in case AI fails
        return jsonify({
            "rating": "ok",
            "message": "We couldn't generate detailed feedback at this moment.",
            "tip": "Always think about the consequences of your actions."
        })

if __name__ == '__main__':
    app.run(debug=True, port=5000)