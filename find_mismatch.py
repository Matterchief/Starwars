import sys

def find_mismatch(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    for i, char in enumerate(content):
        if char == '{':
            stack.append(i)
        elif char == '}':
            if stack:
                stack.pop()
            else:
                print(f"Excess closing brace at position {i}")
                # Print surrounding context
                start = max(0, i - 100)
                end = min(len(content), i + 100)
                print(f"Context: {content[start:end]}")
    
    if stack:
        for pos in stack:
            print(f"Unclosed opening brace at position {pos}")
            start = max(0, pos - 100)
            end = min(len(content), pos + 100)
            print(f"Context: {content[start:end]}")
            # Map position to line number
            lines = content[:pos].split('\n')
            print(f"Line number: {len(lines)}")

if __name__ == "__main__":
    find_mismatch(sys.argv[1])
