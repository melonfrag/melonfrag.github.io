def bM_to_b10(num, m):
    n = 0
    num = str(num)
    characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/"
    kp = []
    if num == "Base is not allowed to be greater than 64.":
        return "Base is not allowed to be greater than 64."
    for i in num:
        if i in characters:
            i = characters.index(i) + 10
        kp.append(i)
    for j in range(len(kp)):
        n += int(kp[-1-j]) * m ** j
    return n

def b10_to_bN(num, n):
    rw = []
    q = ""
    while 1:
        a = num // n
        b = num % n
        num = a
        rw.insert(0, str(b))
        if a == 0: break
    for i in rw:
        try:
            if 9 < int(i):
                i = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/"[int(i)-10]
            q += i
        except:
            q = "Base is not allowed to be greater than 64."
    return q

def convert(num, m, n):
    num_in_b10 = bM_to_b10(num, m)
    return b10_to_bN(num_in_b10, n)

def isPrime(num):
    for i in range(2,int(num ** 0.5)+1):
        k = num/i
        if int(k) == k:
            return False
    return True
